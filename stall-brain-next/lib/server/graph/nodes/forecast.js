import {
  festivalImpact,
  getShelfLifeEntry,
  matchImpact,
  MULTIPLIER_BOUNDS,
  stallBaselines,
} from '../../data/baselines.js'
import { effectiveFactor } from '../../learning/bias.js'
import {
  computePlanFinancials,
  optimizeDraftForBudget,
  resolveItemPricing,
} from '../../utils/economics.js'

/** Clamps a demand multiplier to a sane range so bad signals can't explode it. */
export function clampMultiplier(value) {
  const { min, max } = MULTIPLIER_BOUNDS
  if (!Number.isFinite(value)) return 1
  return Math.min(max, Math.max(min, value))
}

/** Festival factor from signals; 1 when none reported. */
export function festivalFactor(signals) {
  const impacts = (signals?.festivals ?? []).map(
    (festival) => festivalImpact[festival?.impact] ?? 1,
  )
  return impacts.length ? Math.max(...impacts) : 1
}

/** Cricket match factor from signals; 1 when no match scheduled. */
export function matchFactor(signals) {
  const crowd = signals?.match?.expectedCrowd
  return crowd ? (matchImpact[crowd] ?? 1) : 1
}

/** Social buzz factor from signals; 1 when neutral. */
export function socialFactor(signals, multiplier) {
  const fromSignal = signals?.socialBuzz?.factor
  if (Number.isFinite(Number(fromSignal))) return Number(fromSignal)
  const fromMult = multiplier?.social
  return Number.isFinite(Number(fromMult)) ? Number(fromMult) : 1
}

/**
 * Summarizes tomorrow's lookahead signals (lookahead[1]) so today's plan can
 * trim short-shelf-life perishables ahead of rain or pre-stock dry goods ahead
 * of a surge (T3.3 + T3.4).
 */
export function analyzeTomorrowLookahead(signals) {
  const lookahead = Array.isArray(signals?.lookahead) ? signals.lookahead : []
  const tomorrow = lookahead[1] ?? null
  const dayPlus2 = lookahead[2] ?? null

  const tomorrowWeatherImpact = tomorrow?.weather?.footfallImpact ?? 1
  const tomorrowRainPeak = tomorrow?.weather?.rainProbabilityPeak ?? 0
  const tomorrowBadWeather = tomorrowWeatherImpact < 0.85 || tomorrowRainPeak >= 65

  const upcomingSurgeEvents = [tomorrow, dayPlus2]
    .filter(Boolean)
    .flatMap((day) => [
      ...(day.festivals ?? []).filter((f) => (f.expectedFootfall ?? f.impact) === 'high'),
      ...(day.events ?? []).filter((e) => e.expectedFootfall === 'high'),
      ...(day.match?.expectedCrowd === 'high' ? [{ name: day.match.teams }] : []),
    ])

  return {
    tomorrow,
    tomorrowBadWeather,
    upcomingHighDemand: upcomingSurgeEvents.length > 0,
    upcomingSurgeNames: upcomingSurgeEvents.map((e) => e.name).filter(Boolean),
  }
}

/**
 * Computes the safe maximum totalNeeded for a perishable item given its shelf
 * life and tomorrow's outlook. Non-perishable items return Infinity.
 */
export function getPerishableCap(entry, combinedMultiplier, lookaheadSummary) {
  if (!entry?.perishable) return Number.POSITIVE_INFINITY
  const shelfDays = Math.max(1, Number(entry.shelfLifeDays ?? 2))
  const baseCap = shelfDays <= 1 ? entry.baseline * 1.5 : entry.baseline * shelfDays

  if (lookaheadSummary?.tomorrowBadWeather && shelfDays <= 2) {
    return round2(Math.min(baseCap, entry.baseline * Math.min(combinedMultiplier, 1) * 0.9))
  }
  return round2(baseCap)
}

/**
 * Converts an inventory quantity into the item's canonical baseline unit.
 * Supports the frontend's INVENTORY_UNITS; unknown pairs return null so the
 * caller can fall back to treating units as-is.
 */
export function convertToUnit(quantity, fromUnit, toUnit) {
  const q = Number(quantity)
  if (!Number.isFinite(q) || q < 0) return 0
  if (!fromUnit || !toUnit || fromUnit === toUnit) return q

  const table = {
    kg: { g: q / 1000 },
    g: { kg: q * 1000 },
    litres: { ml: q / 1000 },
    pieces: { dozen: q * 12 },
    dozen: { pieces: q / 12 },
  }
  return table[toUnit]?.[fromUnit] ?? null
}

/** Looks up the baseline entry for an item, with a sane fallback. */
export function getBaselineEntry(item, stallType) {
  const byStall = stallBaselines[stallType]
  const entry = byStall?.[item]
  if (entry) return entry
  // Unknown item or stall: generic fallback so the plan still covers it.
  return { baseline: 5, unit: 'units' }
}

/**
 * Computes the deterministic numeric plan. Pure: same inputs always produce
 * the same numbers, and the LLM never does this arithmetic.
 *
 *   combined   = weather x event x weekday x festival x match  (clamped)
 *   totalNeeded = baseline x combined x bias[item]
 *   toBuy      = max(0, totalNeeded - alreadyHave)
 *
 * When `budgetInr` is set and unconstrained cost exceeds the cap,
 * `optimizeDraftForBudget` prioritizes high-margin and high-demand items so
 * total cost stays within `budgetInr` (T3.2).
 */
export function computeDraftPlan({
  stallType,
  items,
  inventory,
  multiplier,
  signals,
  bias,
  budgetInr = null,
  itemPrices = {},
  date = null,
}) {
  const festival = festivalFactor(signals)
  const match = matchFactor(signals)
  const social = socialFactor(signals, multiplier)
  const combined = clampMultiplier(
    (multiplier?.weather ?? 1) *
      (multiplier?.event ?? 1) *
      (multiplier?.weekday ?? 1) *
      festival *
      match *
      social,
  )
  const weekday = date ? new Date(`${date}T00:00:00+05:30`).getDay() : null
  const lookaheadSummary = analyzeTomorrowLookahead(signals)

  const draftItems = []
  const sufficientStockItems = []
  const perishableNotes = []
  let spoilageGuardApplied = false

  for (const item of items) {
    const entry = getBaselineEntry(item, stallType)
    const shelf = getShelfLifeEntry(item, stallType)
    const stock = inventory?.[item] ?? { quantity: 0, unit: entry.unit }
    const rawBias = bias?.[item]
    const biasFactor =
      rawBias && typeof rawBias === 'object'
        ? effectiveFactor(rawBias, weekday)
        : Number.isFinite(Number(rawBias))
          ? Number(rawBias)
          : 1

    const alreadyHave =
      convertToUnit(stock.quantity, stock.unit, entry.unit) ?? stock.quantity
    let totalNeeded = entry.baseline * combined * biasFactor

    // T3.4: for non-perishable items (shelfLifeDays >= 5), modestly pre-stock
    // +15% when tomorrow/day+2 has a confirmed high-demand surge.
    if (!shelf.perishable && lookaheadSummary.upcomingHighDemand) {
      const surged = Math.min(entry.baseline * 2.5, totalNeeded * 1.15)
      if (surged > totalNeeded) {
        totalNeeded = surged
        perishableNotes.push(
          `${item}: +15% dry-stock buffer ahead of ${lookaheadSummary.upcomingSurgeNames[0] ?? 'upcoming rush'}`,
        )
      }
    }

    // T3.3 + T3.4: cap perishable stock so shelf-life limits or bad tomorrow
    // weather never leave fresh goods to spoil.
    const cap = getPerishableCap(
      { ...entry, perishable: shelf.perishable, shelfLifeDays: shelf.shelfLifeDays },
      combined,
      lookaheadSummary,
    )
    if (shelf.perishable && totalNeeded > cap) {
      totalNeeded = cap
      spoilageGuardApplied = true
      perishableNotes.push(
        lookaheadSummary.tomorrowBadWeather && shelf.shelfLifeDays <= 2
          ? `${item}: capped at ${round2(cap)} ${entry.unit} (${shelf.shelfLifeDays}d shelf life + rain expected tomorrow)`
          : `${item}: capped at ${round2(cap)} ${entry.unit} (${shelf.shelfLifeDays}d shelf-life guard)`,
      )
    }

    const toBuy = Math.max(0, totalNeeded - alreadyHave)

    if (toBuy <= 0) {
      sufficientStockItems.push(item)
      continue
    }

    const pricing = resolveItemPricing(item, {
      vendorPrices: itemPrices,
      signalPrices: signals?.prices,
    })

    draftItems.push({
      item,
      unit: entry.unit,
      baseline: entry.baseline,
      bias: round3(biasFactor),
      totalNeeded: round2(totalNeeded),
      alreadyHave: round2(alreadyHave),
      toBuy: round2(toBuy),
      _pricing: pricing,
    })
  }

  // Run profit-maximizing budget optimizer if a daily budget cap is active.
  const rankedInput = draftItems.map((d) => ({
    ...d,
    buyPrice: d._pricing.buyPrice,
    sellPrice: d._pricing.sellPrice,
    unitMargin: d._pricing.unitMargin,
    roiRatio: d._pricing.roiRatio,
  }))
  const optimized = optimizeDraftForBudget(rankedInput, budgetInr)

  // Keep each draft item clean (the 7 canonical numeric fields) so callers and
  // unit tests see a consistent shape; economics live in `financials`.
  const cleanItems = optimized.items.map((d) => ({
    item: d.item,
    unit: d.unit,
    baseline: d.baseline,
    bias: d.bias,
    totalNeeded: d.totalNeeded,
    alreadyHave: d.alreadyHave,
    toBuy: d.toBuy,
  }))

  const financials = computePlanFinancials({
    procurementList: cleanItems,
    sufficientStockItems,
    draftPlan: { budgetConstrained: optimized.budgetConstrained },
    vendorPrices: itemPrices,
    signalPrices: signals?.prices,
    budgetInr,
  })

  return {
    items: cleanItems,
    sufficientStockItems,
    expectedCustomers: Math.round(150 * combined),
    combinedMultiplier: round3(combined),
    factors: {
      weather: multiplier?.weather ?? 1,
      event: multiplier?.event ?? 1,
      weekday: multiplier?.weekday ?? 1,
      festival,
      match,
      social,
    },
    budgetInr: financials.budgetInr,
    totalEstimatedCost: financials.totalCostInr,
    totalEstimatedRevenue: financials.expectedRevenueInr,
    totalEstimatedProfit: financials.expectedProfitInr,
    budgetConstrained: financials.budgetConstrained,
    pricingIsMock: financials.isMockPricing,
    financials,
    perishableNotes,
    spoilageGuardApplied,
  }
}

function round2(value) {
  return Math.round(value * 100) / 100
}

function round3(value) {
  return Math.round(value * 1000) / 1000
}

/**
 * Deterministic forecast node. All arithmetic happens here in code, never in
 * the LLM; the draft is stored in state for the planner to review (T1.5).
 * Side-effect free.
 */
export async function forecastDemand(state) {
  const items = state.sessionIngredients ?? []
  const combined = (state.multiplier?.combined ?? 1)

  const draftPlan = computeDraftPlan({
    stallType: state.profile?.stallType,
    items,
    inventory: state.inventory,
    multiplier: state.multiplier,
    signals: state.signals,
    bias: state.bias,
    budgetInr: state.budgetInr ?? null,
    itemPrices: state.itemPrices ?? {},
    date: state.date ?? null,
  })

  const budgetNote = draftPlan.budgetConstrained
    ? ` (optimized for ₹${draftPlan.budgetInr} budget -> est. cost ₹${draftPlan.totalEstimatedCost}, profit ₹${draftPlan.totalEstimatedProfit})`
    : ` (est. cost ₹${draftPlan.totalEstimatedCost}, revenue ₹${draftPlan.totalEstimatedRevenue})`

  return {
    baseline: Object.fromEntries(
      items.map((item) => [item, getBaselineEntry(item, state.profile?.stallType).baseline]),
    ),
    draftPlan,
    trace: [
      `Demand multiplier x${combined} -> clamped x${draftPlan.combinedMultiplier}`,
      `Deterministic draft: ${draftPlan.items.length} item(s) to buy, ${draftPlan.sufficientStockItems.length} sufficient${budgetNote}`,
    ],
  }
}
