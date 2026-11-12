import { beforeEach, describe, expect, it } from 'vitest'
import { Command } from '@langchain/langgraph'
import { cachedLookup, clearSignalCache, getSignalCacheStats } from '../src/utils/cache.js'
import { withRetry } from '../src/utils/retry.js'
import { buildRunTraceConfig, hashVendorId } from '../src/utils/tracing.js'
import { buildForecastGraph } from '../src/graph/build.js'
import { gatherSignals } from '../src/graph/nodes/gatherSignals.js'
import { planProcurement } from '../src/graph/nodes/plan.js'
import { explain } from '../src/graph/nodes/explain.js'
import { loadContext } from '../src/graph/nodes/loadContext.js'
import { save } from '../src/graph/nodes/save.js'
import {
  formatEvalTable,
  loadEvalCases,
  runBacktest,
} from '../evals/backtest.js'

describe('T4.1 Backtest & eval harness', () => {
  it('loads 20+ cases and new agent beats old naive baseline', () => {
    const cases = loadEvalCases()
    expect(cases.length).toBeGreaterThanOrEqual(20)

    const result = runBacktest({ cases })
    expect(result.passed).toBe(true)
    expect(result.agentMetrics.mape).toBeLessThan(result.oldMetrics.mape)
    expect(result.agentMetrics.stockOutRate).toBeLessThanOrEqual(
      result.oldMetrics.stockOutRate,
    )
    expect(result.agentMetrics.wasteRate).toBeLessThanOrEqual(
      result.oldMetrics.wasteRate,
    )
    expect(result.agentMetrics.validatorPassRate).toBe(100)

    const table = formatEvalTable(result)
    expect(table).toContain('STATUS: PASS')
  })

  it('flags regression (passed=false) when thresholds are violated', () => {
    const cases = loadEvalCases()
    const failed = runBacktest({
      cases,
      thresholds: {
        maxAgentMape: 0.1,
        maxStockOutRate: 0,
        maxWasteRate: 0,
        minValidatorPassRate: 100,
        requireMapeImprovement: true,
      },
    })
    expect(failed.passed).toBe(false)
    expect(failed.failures.length).toBeGreaterThan(0)
  })
})

describe('T4.2 Tracing & per-node timings', () => {
  it('hashes vendorId without leaking raw uid and builds LangGraph trace metadata', () => {
    const hash = hashVendorId('secret-firebase-uid-123')
    expect(hash).toMatch(/^v_[0-9a-f]{12}$/)
    expect(hash).not.toContain('secret-firebase-uid-123')

    const cfg = buildRunTraceConfig({
      runId: 'run-99',
      vendorId: 'secret-firebase-uid-123',
      stallType: 'chaat',
      retryCount: 1,
      simulation: true,
    })
    expect(cfg.configurable.thread_id).toBe('run-99')
    expect(cfg.tags).toEqual(['stall:chaat', 'mode:simulation', 'retries:1'])
    expect(cfg.metadata.vendorHash).toBe(hash)
  })
})

describe('T4.3 Reliability: cache, retries & deterministic fallback when Groq is down', () => {
  beforeEach(() => {
    clearSignalCache()
  })

  it('caches signal lookups within TTL and tracks hits/misses', async () => {
    let calls = 0
    const loader = async () => {
      calls += 1
      return { temp: 30 }
    }
    const first = await cachedLookup('weather:2026-11-12', loader)
    const second = await cachedLookup('weather:2026-11-12', loader)
    expect(first).toEqual({ temp: 30 })
    expect(second).toEqual({ temp: 30 })
    expect(calls).toBe(1)
    expect(getSignalCacheStats()).toMatchObject({ size: 1, hits: 1, misses: 1 })
  })

  it('retries transient failures cleanly with withRetry', async () => {
    let attempts = 0
    const value = await withRetry(
      async () => {
        attempts += 1
        if (attempts < 2) throw new Error('transient timeout')
        return 'ok'
      },
      { retries: 2, delayMs: 0, timeoutMs: 1000 },
    )
    expect(value).toBe('ok')
    expect(attempts).toBe(2)
  })

  it('returns a valid Low-confidence deterministic forecast with nodeTimings when Groq is unreachable', async () => {
    const unreachableLlm = {
      bindTools: () => ({
        invoke: async () => {
          throw new Error('ECONNREFUSED Groq unreachable')
        },
      }),
      withStructuredOutput: () => ({
        invoke: async () => {
          throw new Error('ECONNREFUSED Groq unreachable')
        },
      }),
    }

    const fakeWeatherTool = {
      name: 'getWeather',
      invoke: async () =>
        JSON.stringify({
          label: 'Clear & Sunny ☀️',
          footfallImpact: 1.1,
          recommendation: 'Good weather',
          temperature: 28,
          lookahead: [{ date: '2026-11-12', label: 'Clear', footfallImpact: 1.1 }],
        }),
    }
    const fakeFestivalsTool = {
      name: 'getFestivals',
      invoke: async () => JSON.stringify({ festivals: [], weddingSeason: null }),
    }
    const fakeEventsTool = {
      name: 'getLocalEvents',
      invoke: async () => JSON.stringify({ events: [] }),
    }
    const fakeCricketTool = {
      name: 'getCricketSchedule',
      invoke: async () => JSON.stringify({ matches: [] }),
    }
    const fakePricesTool = {
      name: 'getMandiPrices',
      invoke: async () => JSON.stringify({ prices: [], isMock: true }),
    }

    const graph = buildForecastGraph({
      loadContext: (state) => loadContext(state, { skipFirestore: true }),
      gatherSignals: (state) =>
        gatherSignals(state, {
          llm: unreachableLlm,
          tools: [
            fakeWeatherTool,
            fakeFestivalsTool,
            fakeEventsTool,
            fakeCricketTool,
            fakePricesTool,
          ],
        }),
      planProcurement: (state) => planProcurement(state, { llm: unreachableLlm }),
      explain: (state) => explain(state, { llm: unreachableLlm }),
      save: (state) => save(state, { skipFirestore: true }),
    })

    const runId = 'offline-groq-run'
    const config = buildRunTraceConfig({
      runId,
      vendorId: 'vendor-offline-test',
      stallType: 'chaat',
    })

    const paused = await graph.invoke(
      {
        vendorId: 'vendor-offline-test',
        runId,
        request: {
          stall: { id: 'chaat', name: 'Chaat Stall', items: ['aloo', 'dahi'] },
          items: ['aloo', 'dahi'],
          inventory: { aloo: { quantity: 2, unit: 'kg' }, dahi: { quantity: 0, unit: 'litres' } },
        },
      },
      config,
    )

    expect(paused.__interrupt__).toHaveLength(1)
    const pendingPlan = paused.__interrupt__[0].value.plan
    expect(pendingPlan.confidenceLevel).toBe('Low')
    expect(pendingPlan.procurementList.length).toBeGreaterThan(0)
    expect(paused.nodeTimings.map((t) => t.node)).toEqual([
      'loadContext',
      'gatherSignals',
      'forecastDemand',
      'planProcurement',
      'validate',
      'explain',
    ])

    const completed = await graph.invoke(
      new Command({ resume: { approved: true } }),
      config,
    )
    expect(completed.approvedPlan.confidenceLevel).toBe('Low')
    expect(completed.nodeTimings.some((t) => t.node === 'save')).toBe(true)
  })
})

