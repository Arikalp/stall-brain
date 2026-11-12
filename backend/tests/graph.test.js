import { describe, expect, it } from 'vitest'
import { buildForecastGraph, MAX_PLAN_RETRIES, routeAfterValidate } from '../src/graph/build.js'
import { loadContext } from '../src/graph/nodes/loadContext.js'
import { forecastDemand } from '../src/graph/nodes/forecast.js'

describe('routeAfterValidate', () => {
  it('retries the planner when errors remain', () => {
    expect(
      routeAfterValidate({ validationErrors: ['bad math'], retryCount: 0 }),
    ).toBe('planProcurement')
  })

  it('stops retrying after the max retry count', () => {
    expect(
      routeAfterValidate({
        validationErrors: ['bad math'],
        retryCount: MAX_PLAN_RETRIES,
      }),
    ).toBe('explain')
  })

  it('continues to explain when the plan is valid', () => {
    expect(routeAfterValidate({ validationErrors: [], retryCount: 0 })).toBe(
      'explain',
    )
  })
})

describe('forecast graph skeleton', () => {
  const request = {
    stall: { id: 'chaat', name: 'Chaat Stall', items: ['aloo'] },
    items: ['aloo'],
    inventory: { aloo: { quantity: 4, unit: 'kg' } },
    dateLabel: '12 November 2026',
    dayName: 'Thursday',
    weather: { temperature: 28 },
    weatherSignal: {
      label: 'Clear & Sunny ☀️',
      footfallImpact: 1.2,
      recommendation: 'Stock up.',
    },
    eventSummary: 'No special events reported today.',
    weeklyMultiplier: 1,
    eventMultiplier: 1,
    demandMultiplier: 1.2,
  }

  const fakePlan = {
    summary: 'test',
    hindiSummary: 'टेस्ट',
    expectedCustomers: 40,
    peakHours: '12-2pm',
    confidenceLevel: 'Low',
    confidenceReason: 'stub',
    procurementList: [],
    sufficientStockItems: [],
    specialAdvice: 'test || टेस्ट',
  }

  // A fake planner + validator so the skeleton test needs no LLM key, and a
  // deterministic fake gatherSignals (the real one calls Groq for tool choice).
  const fakeGatherSignals = async (state) => {
    const request = state.request ?? {}
    return {
      signals: {
        weather: request.weatherSignal
          ? { label: request.weatherSignal.label, footfallImpact: request.weatherSignal.footfallImpact, recommendation: '' }
          : null,
        events: [],
        festivals: [],
        match: null,
        prices: [],
        social: [],
        errors: [],
      },
      multiplier: {
        weather: request.weatherSignal?.footfallImpact ?? 1,
        event: request.eventMultiplier ?? 1,
        weekday: request.weeklyMultiplier ?? 1,
        festival: 1,
        match: 1,
        combined: request.demandMultiplier ?? 1,
      },
      trace: ['Weather: (fake) x1.2', 'fake signals gathered'],
    }
  }

  function makeGraph(validator) {
    return buildForecastGraph({
      planProcurement: async (state) => ({
        plan: { ...fakePlan, confidenceReason: `retries=${state.retryCount ?? 0}` },
        trace: ['fake planner'],
      }),
      validate: validator,
      explain: async () => ({ trace: ['fake explain'] }),
      gatherSignals: fakeGatherSignals,
    })
  }

  it('runs all nodes in order and returns a plan', async () => {
    const graph = makeGraph(async () => ({
      validationErrors: [],
      trace: ['ok'],
    }))

    const finalState = await graph.invoke(
      { vendorId: 'vendor-1', runId: 'run-1', request },
      { configurable: { thread_id: 'run-1' } },
    )

    expect(finalState.profile.stallLabel).toBe('Chaat Stall')
    expect(finalState.sessionIngredients).toEqual(['aloo'])
    expect(finalState.multiplier.combined).toBe(1.2)
    expect(finalState.signals.weather.label).toContain('Clear')
    expect(finalState.plan.summary).toBe('test')
    // trace order proves node order: loadContext -> gatherSignals -> forecast -> plan -> validate -> explain
    const trace = finalState.trace.join(' | ')
    expect(trace.indexOf('Loaded context')).toBeLessThan(
      trace.indexOf('Weather:'),
    )
    expect(trace.indexOf('Weather:')).toBeLessThan(
      trace.indexOf('Deterministic draft'),
    )
    expect(trace.indexOf('fake planner')).toBeGreaterThan(
      trace.indexOf('Deterministic draft'),
    )
  })

  it('loops back to the planner on validation failure, then proceeds', async () => {
    let calls = 0
    const validator = async (state) => {
      calls += 1
      if (calls <= 2) {
        return {
          validationErrors: ['budget exceeded'],
          retryCount: (state.retryCount ?? 0) + 1,
          trace: ['validator: rejected'],
        }
      }
      return { validationErrors: [], trace: ['validator: accepted'] }
    }

    const graph = makeGraph(validator)
    const finalState = await graph.invoke(
      { vendorId: 'v', runId: 'run-2', request },
      { configurable: { thread_id: 'run-2' } },
    )

    expect(calls).toBe(3)
    expect(finalState.plan.confidenceReason).toBe('retries=2')
    expect(finalState.trace.filter((step) => step === 'validator: rejected')).toHaveLength(2)
  })

  it('the real validator corrects a deliberately wrong plan and the loop recovers', async () => {
    let calls = 0
    const wrongThenRight = async () => {
      calls += 1
      if (calls === 1) {
        // Deliberately wrong: broken arithmetic, missing item, bad unit.
        return {
          plan: {
            summary: 'bad',
            hindiSummary: 'गलत',
            expectedCustomers: 999,
            peakHours: 'never',
            confidenceLevel: 'High',
            confidenceReason: 'overconfident',
            procurementList: [
              {
                item: 'aloo',
                totalNeeded: '14.4 kg',
                alreadyHave: '4 kg',
                toBuy: '99 kg',
                unit: 'kg',
                priority: 'essential',
              },
            ],
            sufficientStockItems: [],
            specialAdvice: 'bad || गलत',
          },
          trace: ['wrong plan'],
        }
      }
      return {
        plan: {
          summary: 'good',
          hindiSummary: 'अच्छा',
          expectedCustomers: 180,
          peakHours: '12-2pm and 6-9pm',
          confidenceLevel: 'High',
          confidenceReason: 'recovered',
          procurementList: [
            {
              item: 'aloo',
              totalNeeded: '14.4 kg',
              alreadyHave: '4 kg',
              toBuy: '10.4 kg',
              unit: 'kg',
              priority: 'essential',
            },
            {
              item: 'puri',
              totalNeeded: '360 pieces',
              alreadyHave: '0 pieces',
              toBuy: '360 pieces',
              unit: 'pieces',
              priority: 'essential',
            },
            {
              item: 'imli chutney',
              totalNeeded: '4.8 litres',
              alreadyHave: '0 litres',
              toBuy: '4.8 litres',
              unit: 'litres',
              priority: 'moderate',
            },
          ],
          sufficientStockItems: [],
          specialAdvice: 'good || अच्छा',
        },
        trace: ['right plan'],
      }
    }

    const graph = buildForecastGraph({ planProcurement: wrongThenRight, gatherSignals: fakeGatherSignals })
    const finalState = await graph.invoke(
      { vendorId: 'v', runId: 'run-3', request },
      { configurable: { thread_id: 'run-3' } },
    )

    expect(calls).toBe(2)
    expect(finalState.plan.summary).toBe('good')
    expect(finalState.validationErrors).toEqual([])
    expect(finalState.trace.join(' | ')).toContain('retrying planner (1/3)')
  })

  it('falls back to the deterministic draft after 3 failed attempts', async () => {
    const alwaysWrong = async () => ({
      plan: {
        summary: 'bad',
        hindiSummary: 'गलत',
        expectedCustomers: 1,
        peakHours: 'x',
        confidenceLevel: 'High',
        confidenceReason: 'x',
        procurementList: [],
        sufficientStockItems: [],
        specialAdvice: 'x || गलत',
      },
      trace: ['wrong'],
    })

    const graph = buildForecastGraph({ planProcurement: alwaysWrong, gatherSignals: fakeGatherSignals })
    const finalState = await graph.invoke(
      { vendorId: 'v', runId: 'run-4', request },
      { configurable: { thread_id: 'run-4' } },
    )

    expect(finalState.plan.confidenceLevel).toBe('Low')
    expect(finalState.plan.procurementList[0].item).toBe('aloo')
    expect(finalState.plan.procurementList[0].toBuy).toBe('10.4 kg')
    expect(finalState.trace.join(' | ')).toContain('deterministic draft with low confidence')
  })
})

describe('stub nodes', () => {
  const request = {
    stall: { id: 'chai', name: 'Chai Tapri', items: ['milk'] },
    items: ['milk'],
    inventory: {},
    weatherSignal: { label: 'Foggy 🌫️', footfallImpact: 0.85 },
    weeklyMultiplier: 0.9,
    eventMultiplier: 1,
    demandMultiplier: 0.765,
  }

  it('loadContext builds a profile and inventory from the request', async () => {
    const update = await loadContext({ request })
    expect(update.profile.ingredients).toEqual(['milk'])
    expect(update.inventory.milk).toEqual({ quantity: 0, unit: 'units' })
  })

  it('forecastDemand computes a real draft (chai fallback case)', async () => {
    const update = await forecastDemand({
      profile: { stallType: 'chai' },
      sessionIngredients: ['milk'],
      inventory: { milk: { quantity: 0, unit: 'litres' } },
      multiplier: { weather: 1, event: 1, weekday: 1, combined: 1.1 },
      signals: {},
      bias: {},
    })
    expect(update.draftPlan.items[0]).toMatchObject({
      item: 'milk',
      baseline: 20,
      unit: 'litres',
      totalNeeded: 20,
      toBuy: 20,
    })
    expect(update.baseline.milk).toBe(20)
  })
})
