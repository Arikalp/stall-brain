import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { getShelfLifeEntry } from '../src/data/baselines.js'
import {
  computeDraftPlan,
  getBaselineEntry,
} from '../src/graph/nodes/forecast.js'
import { buildFallbackPlan, validatePlan } from '../src/graph/nodes/validate.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const DEFAULT_CASES_DIR = path.join(__dirname, 'cases')

export const DEFAULT_THRESHOLDS = Object.freeze({
  maxAgentMape: 15,
  maxStockOutRate: 15,
  maxWasteRate: 15,
  minValidatorPassRate: 95,
  requireMapeImprovement: true,
})

export function loadEvalCases(casesDir = DEFAULT_CASES_DIR) {
  const files = fs
    .readdirSync(casesDir)
    .filter((f) => f.endsWith('.json'))
    .sort()
  const allCases = []
  for (const file of files) {
    const raw = fs.readFileSync(path.join(casesDir, file), 'utf8')
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      allCases.push(...parsed)
    }
  }
  return allCases
}

/**
 * Simulates the pre-upgrade single-prompt baseline:
 * only multiplies daily baseline by weather and weekday factors (misses
 * festival/match signals, learned bias, social buzz, and spoilage caps).
 */
export function predictOldBaseline(testCase) {
  const weather = testCase.multiplier?.weather ?? 1
  const weekday = testCase.multiplier?.weekday ?? 1
  const naiveMultiplier = weather * weekday

  const predicted = {}
  for (const item of testCase.items ?? []) {
    const entry = getBaselineEntry(item, testCase.stallType)
    predicted[item] = Math.round(entry.baseline * naiveMultiplier * 100) / 100
  }
  return predicted
}

/**
 * Runs the new agent pipeline deterministically (forecastDraft + buildFallbackPlan
 * + validatePlan) and records validator pass status and retry count.
 */
export function predictWithAgent(testCase) {
  const draftPlan = computeDraftPlan({
    stallType: testCase.stallType,
    items: testCase.items ?? [],
    inventory: testCase.inventory ?? {},
    multiplier: testCase.multiplier ?? { weather: 1, event: 1, weekday: 1 },
    signals: testCase.signals ?? {},
    bias: testCase.bias ?? {},
    budgetInr: testCase.budgetInr ?? null,
    date: testCase.date ?? null,
  })

  const plan = buildFallbackPlan(draftPlan, testCase.multiplier)
  plan.confidenceLevel = 'High'

  const validation = validatePlan({
    plan,
    draftPlan,
    sessionIngredients: testCase.items ?? [],
    budgetInr: testCase.budgetInr ?? null,
    signals: testCase.signals ?? {},
    stallType: testCase.stallType,
  })

  const predicted = {}
  for (const row of draftPlan.items ?? []) {
    predicted[row.item] = row.totalNeeded
  }
  for (const item of draftPlan.sufficientStockItems ?? []) {
    predicted[item] = testCase.inventory?.[item]?.quantity ?? 0
  }

  return {
    predicted,
    validatorPassed: validation.valid,
    retries: validation.valid ? 0 : 1,
    spoilageGuardApplied: Boolean(draftPlan.spoilageGuardApplied),
  }
}

export function scorePredictions(cases, predictorFn) {
  let itemCount = 0
  let absPctErrorSum = 0
  let stockOuts = 0
  let wasteEvents = 0
  let validatorPasses = 0
  let totalRetries = 0

  for (const tc of cases) {
    const res = predictorFn(tc)
    const predicted = res.predicted ?? res
    if (res.validatorPassed !== false) validatorPasses += 1
    totalRetries += res.retries ?? 0

    for (const item of tc.items ?? []) {
      const actual = Number(tc.actualDemand?.[item] ?? 0)
      const pred = Number(predicted[item] ?? 0)
      if (!Number.isFinite(actual) || actual <= 0) continue

      itemCount += 1
      absPctErrorSum += (Math.abs(pred - actual) / actual) * 100

      if (pred < actual * 0.9) {
        stockOuts += 1
      }

      const shelf = getShelfLifeEntry(item, tc.stallType)
      const wasteThreshold = shelf.perishable ? actual * 1.15 : actual * 1.25
      if (pred > wasteThreshold) {
        wasteEvents += 1
      }
    }
  }

  const n = cases.length || 1
  const m = itemCount || 1
  return {
    itemDays: itemCount,
    mape: round2(absPctErrorSum / m),
    stockOutRate: round2((stockOuts / m) * 100),
    wasteRate: round2((wasteEvents / m) * 100),
    validatorPassRate: round2((validatorPasses / n) * 100),
    avgRetries: round2(totalRetries / n),
  }
}

function round2(value) {
  return Math.round(value * 100) / 100
}

export function runBacktest({
  cases = loadEvalCases(),
  thresholds = DEFAULT_THRESHOLDS,
} = {}) {
  const oldMetrics = scorePredictions(cases, (tc) => ({
    predicted: predictOldBaseline(tc),
    validatorPassed: false,
    retries: 0,
  }))
  // Old pipeline did not have a validator; report N/A-equivalent 0% validator pass rate cleanly.
  oldMetrics.validatorPassRate = 0

  const agentMetrics = scorePredictions(cases, predictWithAgent)

  const failures = []
  if (cases.length < 20) {
    failures.push(`Expected >= 20 eval cases, got ${cases.length}`)
  }
  if (agentMetrics.mape > thresholds.maxAgentMape) {
    failures.push(
      `Agent MAPE ${agentMetrics.mape}% exceeds max ${thresholds.maxAgentMape}%`,
    )
  }
  if (agentMetrics.stockOutRate > thresholds.maxStockOutRate) {
    failures.push(
      `Agent Stock-Out Rate ${agentMetrics.stockOutRate}% exceeds max ${thresholds.maxStockOutRate}%`,
    )
  }
  if (agentMetrics.wasteRate > thresholds.maxWasteRate) {
    failures.push(
      `Agent Waste Rate ${agentMetrics.wasteRate}% exceeds max ${thresholds.maxWasteRate}%`,
    )
  }
  if (agentMetrics.validatorPassRate < thresholds.minValidatorPassRate) {
    failures.push(
      `Agent Validator Pass Rate ${agentMetrics.validatorPassRate}% below min ${thresholds.minValidatorPassRate}%`,
    )
  }
  if (thresholds.requireMapeImprovement && agentMetrics.mape >= oldMetrics.mape) {
    failures.push(
      `Regression: Agent MAPE (${agentMetrics.mape}%) did not beat Old Baseline (${oldMetrics.mape}%)`,
    )
  }

  return {
    caseCount: cases.length,
    oldMetrics,
    agentMetrics,
    passed: failures.length === 0,
    failures,
  }
}

export function formatEvalTable(result) {
  const { caseCount, oldMetrics, agentMetrics, passed, failures } = result
  const rows = [
    ['Cases evaluated', String(caseCount), String(caseCount)],
    ['Item-days scored', String(oldMetrics.itemDays), String(agentMetrics.itemDays)],
    ['MAPE (totalNeeded)', `${oldMetrics.mape}%`, `${agentMetrics.mape}%`],
    ['Stock-Out Rate (>10% short)', `${oldMetrics.stockOutRate}%`, `${agentMetrics.stockOutRate}%`],
    ['Waste Rate (overbought)', `${oldMetrics.wasteRate}%`, `${agentMetrics.wasteRate}%`],
    ['Validator Pass Rate', 'N/A (0%)', `${agentMetrics.validatorPassRate}%`],
    ['Avg Validator Retries', 'N/A', String(agentMetrics.avgRetries)],
  ]

  const header =
    '\n=== Bazaar Brain Backtest & Eval Report ===\n' +
    'Metric                         | Old Baseline | New Agent\n' +
    '-------------------------------+--------------+----------\n'
  const body = rows
    .map(
      ([label, oldVal, newVal]) =>
        `${label.padEnd(30)} | ${oldVal.padEnd(12)} | ${newVal}`,
    )
    .join('\n')
  const footer = passed
    ? '\n\nSTATUS: PASS (Agent meets all quality & regression gates)\n'
    : `\n\nSTATUS: FAIL\n- ${failures.join('\n- ')}\n`
  return header + body + footer
}

const isMainModule =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href

if (isMainModule) {
  const result = runBacktest()
  console.log(formatEvalTable(result))
  process.exit(result.passed ? 0 : 1)
}

