/**
 * T3.2 - Costs, budget, and profit optimization tests
 *
 * Acceptance check:
 *   "With a tight budget, the agent prioritizes high-margin and high-demand
 *    items and the validator enforces the cap."
 */

import { describe, expect, it } from 'vitest'
import {
  computePlanFinancials,
  optimizeDraftForBudget,
  resolveItemPricing,
} from '../src/utils/economics.js'
import { computeDraftPlan } from '../src/graph/nodes/forecast.js'
import { validatePlan } from '../src/graph/nodes/validate.js'
import { buildForecastGraph } from '../src/graph/build.js'
import { explain as realExplain } from '../src/graph/nodes/explain.js'
import { loadContext } from '../src/graph/nodes/loadContext.js'

describe('resolveItemPricing', () => {
  it('prefers vendor prices over signal and mock prices and clears isMock', () => {
    const pricing = resolveItemPricing('aloo', {
      vendorPrices: { aloo: { buyPrice: 25, sellPrice: 70 } },
      signalPrices: [{ item: 'aloo', pricePerUnit: 20, unit: 'kg', source: 'agmarknet', isMock: false }],
    })
    expect(pricing.buyPrice).toBe(25)
    expect(pricing.sellPrice).toBe(70)
    expect(pricing.unitMargin).toBe(45)
    expect(pricing.isMock).toBe(false)
  })

  it('uses mock fallback when vendor and signal prices are missing and marks isMock=true', () => {
    const pricing = resolveItemPricing('aloo', {})
    expect(pricing.buyPrice).toBeGreaterThan(0)
    expect(pricing.sellPrice).toBeGreaterThan(pricing.buyPrice)
    expect(pricing.isMock).toBe(true)
  })
})

describe('optimizeDraftForBudget (tight budget profit maximization)', () => {
  it('prioritizes high-margin items over low-margin items and stays under budget', () => {
    const items = [
      {
        item: 'low_margin_item',
        unit: 'kg',
        baseline: 10,
        bias: 1,
        totalNeeded: 10,
        alreadyHave: 0,
        toBuy: 10,
        buyPrice: 100,
        sellPrice: 110, // margin ₹10 / ₹100 = 10% ROI
        unitMargin: 10,
        roiRatio: 0.1,
      },
      {
        item: 'high_margin_item',
        unit: 'kg',
        baseline: 10,
        bias: 1,
        totalNeeded: 10,
        alreadyHave: 0,
        toBuy: 10,
        buyPrice: 50,
        sellPrice: 150, // margin ₹100 / ₹50 = 200% ROI
        unitMargin: 100,
        roiRatio: 2.0,
      },
    ]

    // Unconstrained cost = 10*100 + 10*50 = ₹1500. Tight budget = ₹700.
    const result = optimizeDraftForBudget(items, 700)
    expect(result.budgetConstrained).toBe(true)

    const highMargin = result.items.find((i) => i.item === 'high_margin_item')
    const lowMargin = result.items.find((i) => i.item === 'low_margin_item')

    // High-margin item gets full 10 kg (cost ₹500), leaving ₹200 -> 2 kg of low-margin item.
    expect(highMargin.toBuy).toBe(10)
    expect(lowMargin.toBuy).toBe(2)

    const totalCost = highMargin.toBuy * 50 + lowMargin.toBuy * 100
    expect(totalCost).toBeLessThanOrEqual(700)
  })

  it('never exceeds budgetInr even with fractional prices', () => {
    const items = [
      {
        item: 'item_a',
        unit: 'kg',
        baseline: 10,
        bias: 1,
        totalNeeded: 10,
        alreadyHave: 0,
        toBuy: 10,
        buyPrice: 33.33,
        sellPrice: 70,
        unitMargin: 36.67,
        roiRatio: 1.1,
      },
    ]
    const result = optimizeDraftForBudget(items, 100)
    expect(result.items[0].toBuy * 33.33).toBeLessThanOrEqual(100)
  })
})

describe('computeDraftPlan with budget & pricing', () => {
  it('optimizes chai stall items under a tight ₹800 budget', () => {
    const draft = computeDraftPlan({
      stallType: 'chai',
      items: ['milk', 'tea leaves', 'sugar', 'cups'],
      inventory: {},
      multiplier: { weather: 1, event: 1, weekday: 1 },
      signals: {},
      bias: {},
      budgetInr: 800,
      itemPrices: {
        milk: { buyPrice: 55, sellPrice: 145 },
        'tea leaves': { buyPrice: 280, sellPrice: 900 }, // highest ROI!
        sugar: { buyPrice: 42, sellPrice: 95 },
        cups: { buyPrice: 2, sellPrice: 5 },
      },
    })

    expect(draft.budgetConstrained).toBe(true)
    expect(draft.totalEstimatedCost).toBeLessThanOrEqual(800)
    expect(draft.totalEstimatedRevenue).toBeGreaterThan(draft.totalEstimatedCost)
    expect(draft.totalEstimatedProfit).toBeGreaterThan(0)
    expect(draft.pricingIsMock).toBe(false)

    // Highest ROI item ('tea leaves', 221% ROI) should be fully funded (2 kg).
    const teaLeaves = draft.items.find((i) => i.item === 'tea leaves')
    expect(teaLeaves.toBuy).toBe(2)
  })
})

describe('validatePlan budget enforcement', () => {
  const draftPlan = {
    items: [
      {
        item: 'aloo',
        unit: 'kg',
        baseline: 10,
        bias: 1,
        totalNeeded: 10,
        alreadyHave: 0,
        toBuy: 10,
      },
      {
        item: 'chhole',
        unit: 'kg',
        baseline: 5,
        bias: 1,
        totalNeeded: 5,
        alreadyHave: 0,
        toBuy: 5,
      },
    ],
    sufficientStockItems: [],
    expectedCustomers: 150,
  }

  const overBudgetPlan = {
    summary: 'ok',
    hindiSummary: 'ठीक',
    expectedCustomers: 150,
    peakHours: '12-2pm',
    confidenceLevel: 'High',
    confidenceReason: 'ok',
    procurementList: [
      {
        item: 'aloo',
        totalNeeded: '10 kg',
        alreadyHave: '0 kg',
        toBuy: '10 kg', // 10 * 25 = 250
        unit: 'kg',
        priority: 'essential',
      },
      {
        item: 'chhole',
        totalNeeded: '5 kg',
        alreadyHave: '0 kg',
        toBuy: '5 kg', // 5 * 100 = 500 -> total 750 > 400
        unit: 'kg',
        priority: 'moderate',
      },
    ],
    sufficientStockItems: [],
    specialAdvice: 'ok || ठीक',
  }

  it('rejects a plan whose total cost exceeds budgetInr', () => {
    const result = validatePlan({
      plan: overBudgetPlan,
      draftPlan,
      sessionIngredients: ['aloo', 'chhole'],
      budgetInr: 400,
      itemPrices: {
        aloo: { buyPrice: 25, sellPrice: 65 },
        chhole: { buyPrice: 100, sellPrice: 210 },
      },
    })
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('exceeds daily budget'))).toBe(true)
  })

  it('accepts a plan whose total cost is within budgetInr', () => {
    const result = validatePlan({
      plan: overBudgetPlan,
      draftPlan,
      sessionIngredients: ['aloo', 'chhole'],
      budgetInr: 800,
      itemPrices: {
        aloo: { buyPrice: 25, sellPrice: 65 },
        chhole: { buyPrice: 100, sellPrice: 210 },
      },
    })
    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
  })
})

describe('computePlanFinancials', () => {
  it('computes total cost, expected revenue, profit, and margin%', () => {
    const financials = computePlanFinancials({
      procurementList: [
        { item: 'aloo', totalNeeded: '10 kg', alreadyHave: '2 kg', toBuy: '8 kg' },
      ],
      vendorPrices: { aloo: { buyPrice: 20, sellPrice: 50 } },
      budgetInr: 200,
    })
    // toBuy cost = 8 * 20 = 160; totalNeeded revenue = 10 * 50 = 500; COGS = 10 * 20 = 200; profit = 300; margin = 60%
    expect(financials.totalCostInr).toBe(160)
    expect(financials.expectedRevenueInr).toBe(500)
    expect(financials.expectedProfitInr).toBe(300)
    expect(financials.marginPercent).toBe(60)
    expect(financials.withinBudget).toBe(true)
    expect(financials.isMockPricing).toBe(false)
  })
})

describe('loadContext budget and price resolution', () => {
  it('carries budgetInr and itemPrices from the request into state', async () => {
    const out = await loadContext(
      {
        vendorId: 'v1',
        request: {
          stall: { id: 'chaat', name: 'Chaat Stall', items: ['aloo'] },
          items: ['aloo'],
          inventory: {},
          budgetInr: 500,
          itemPrices: { aloo: { buyPrice: 24, sellPrice: 68 } },
        },
      },
      { skipFirestore: true },
    )
    expect(out.budgetInr).toBe(500)
    expect(out.itemPrices.aloo).toEqual({ buyPrice: 24, sellPrice: 68 })
  })
})

describe('full graph budget loop', () => {
  it('rejects an over-budget LLM plan, retries, and attaches financials to final output', async () => {
    let attempts = 0
    const graph = buildForecastGraph({
      loadContext: (state) => loadContext(state, { skipFirestore: true }),
      gatherSignals: async () => ({
        signals: {
          weather: { label: 'Clear', footfallImpact: 1, recommendation: '' },
          events: [],
          festivals: [],
          match: null,
          prices: [],
          social: [],
          errors: [],
        },
        multiplier: { weather: 1, event: 1, weekday: 1, combined: 1 },
        trace: ['Stub signals'],
      }),
      planProcurement: async (state) => {
        attempts += 1
        // Attempt 1 intentionally overshoots the ₹200 budget (10 * 25 = 250 > 200).
        // Attempt 2 respects the budget-optimized draft (8 * 25 = 200 <= 200).
        const draftAloo = state.draftPlan.items[0]
        const qty = attempts === 1 ? 10 : draftAloo.toBuy
        return {
          plan: {
            summary: 'Plan',
            hindiSummary: 'योजना',
            expectedCustomers: 150,
            peakHours: '12-2pm',
            confidenceLevel: 'High',
            confidenceReason: 'Good data',
            procurementList: [
              {
                item: 'aloo',
                totalNeeded: `${qty} kg`,
                alreadyHave: '0 kg',
                toBuy: `${qty} kg`,
                unit: 'kg',
                priority: 'essential',
              },
            ],
            sufficientStockItems: [],
            specialAdvice: 'Start early || जल्दी शुरू करें',
          },
          trace: [`Planner attempt #${attempts}`],
        }
      },
      explain: (state) => realExplain(state, { skipLlm: true }),
      humanApproval: async (state) => ({
        approvedPlan: state.plan,
        approvedEdits: [],
        trace: ['Auto-approved in test'],
      }),
      save: async () => ({ trace: ['Skip save in test'] }),
    })

    const finalState = await graph.invoke(
      {
        vendorId: 'v1',
        runId: 'budget-loop-test',
        request: {
          stall: { id: 'chaat', name: 'Chaat Stall', items: ['aloo'] },
          items: ['aloo'],
          inventory: {},
          budgetInr: 200,
          itemPrices: { aloo: { buyPrice: 25, sellPrice: 65 } },
        },
      },
      { configurable: { thread_id: 'budget-loop-test' } },
    )

    expect(attempts).toBe(2)
    expect(finalState.approvedPlan.financials.totalCostInr).toBe(200)
    expect(finalState.approvedPlan.financials.expectedRevenueInr).toBe(520)
    expect(finalState.approvedPlan.financials.expectedProfitInr).toBe(320)
    expect(finalState.approvedPlan.financials.withinBudget).toBe(true)
    expect(finalState.trace.some((t) => t.includes('exceeds daily budget'))).toBe(true)
  })
})
