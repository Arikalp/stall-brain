import { describe, expect, it } from 'vitest'
import { forecastDemand } from '../src/graph/nodes/forecast.js'
import {
  clampMultiplier,
  computeDraftPlan,
  convertToUnit,
  festivalFactor,
  matchFactor,
} from '../src/graph/nodes/forecast.js'

const chaat = { stallType: 'chaat', items: ['aloo', 'imli chutney'] }

function run(overrides = {}) {
  return computeDraftPlan({
    stallType: 'chaat',
    items: ['aloo'],
    inventory: {},
    multiplier: { weather: 1, event: 1, weekday: 1 },
    signals: {},
    bias: {},
    ...overrides,
  })
}

describe('computeDraftPlan', () => {
  it('computes a normal day deterministically', () => {
    const draft = run()
    expect(draft.items[0]).toEqual({
      item: 'aloo',
      unit: 'kg',
      baseline: 12,
      bias: 1,
      totalNeeded: 12,
      alreadyHave: 0,
      toBuy: 12,
    })
    expect(draft.expectedCustomers).toBe(150)
  })

  it('reduces the buy list on a rainy day (weather 0.7)', () => {
    const draft = run({ multiplier: { weather: 0.7, event: 1, weekday: 1 } })
    expect(draft.combinedMultiplier).toBe(0.7)
    expect(draft.items[0].totalNeeded).toBeCloseTo(8.4)
  })

  it('raises quantities on a big match day', () => {
    const draft = run({
      signals: { match: { expectedCrowd: 'high' } },
    })
    expect(draft.combinedMultiplier).toBe(1.5)
    expect(draft.items[0].totalNeeded).toBe(18)
  })

  it('raises quantities on a festival day', () => {
    const draft = run({
      signals: { festivals: [{ name: 'Diwali', impact: 'high' }] },
    })
    expect(festivalFactor({ festivals: [{ impact: 'high' }] })).toBe(1.4)
    expect(draft.combinedMultiplier).toBe(1.4)
    expect(draft.items[0].totalNeeded).toBeCloseTo(16.8)
  })

  it('handles zero inventory vs partial inventory', () => {
    const zero = run({ inventory: { aloo: { quantity: 0, unit: 'kg' } } })
    const partial = run({ inventory: { aloo: { quantity: 4, unit: 'kg' } } })
    expect(zero.items[0].toBuy).toBe(12)
    expect(partial.items[0].toBuy).toBe(8)
  })

  it('moves fully-stocked items to sufficientStockItems', () => {
    const draft = run({ inventory: { aloo: { quantity: 15, unit: 'kg' } } })
    expect(draft.items).toHaveLength(0)
    expect(draft.sufficientStockItems).toEqual(['aloo'])
  })

  it('applies learned bias factors', () => {
    const draft = run({ bias: { aloo: 0.8 } })
    expect(draft.items[0].totalNeeded).toBeCloseTo(9.6)
    expect(draft.items[0].bias).toBe(0.8)
  })

  it('clamps runaway multipliers into the sane range', () => {
    expect(clampMultiplier(10)).toBe(2.5)
    expect(clampMultiplier(0.05)).toBe(0.4)
    expect(clampMultiplier(Number.NaN)).toBe(1)
  })

  it('converts inventory units into baseline units', () => {
    const draft = run({
      inventory: { aloo: { quantity: 500, unit: 'g' } },
    })
    expect(draft.items[0].alreadyHave).toBe(0.5)
    expect(draft.items[0].toBuy).toBe(11.5)
  })

  it('is deterministic: identical inputs give identical output', () => {
    const a = run()
    const b = run()
    expect(a).toEqual(b)
  })

  it('falls back to a generic baseline for unknown items', () => {
    const draft = computeDraftPlan({
      stallType: 'chaat',
      items: ['pani puri Masala'],
      inventory: {},
      multiplier: { weather: 1, event: 1, weekday: 1 },
      signals: {},
      bias: {},
    })
    expect(draft.items[0].baseline).toBe(5)
    expect(draft.items[0].unit).toBe('units')
  })
})

describe('convertToUnit', () => {
  it('supports the frontend unit set', () => {
    expect(convertToUnit(2, 'kg', 'g')).toBe(2000)
    expect(convertToUnit(1500, 'g', 'kg')).toBe(1.5)
    expect(convertToUnit(2, 'dozen', 'pieces')).toBe(24)
    expect(convertToUnit(24, 'pieces', 'dozen')).toBe(2)
    expect(convertToUnit(3, 'kg', 'litres')).toBeNull()
    expect(convertToUnit(-1, 'kg', 'kg')).toBe(0)
  })
})

describe('matchFactor', () => {
  it('is 1 without a match and uses the crowd level otherwise', () => {
    expect(matchFactor({})).toBe(1)
    expect(matchFactor({ match: { expectedCrowd: 'medium' } })).toBe(1.3)
  })
})

describe('forecastDemand node', () => {
  it('returns a draft plan plus trace in state shape', async () => {
    const update = await forecastDemand({
      profile: { stallType: 'chaat' },
      sessionIngredients: ['aloo'],
      inventory: { aloo: { quantity: 4, unit: 'kg' } },
      multiplier: { weather: 1, event: 1, weekday: 1, combined: 1 },
      signals: {},
      bias: {},
    })
    expect(update.draftPlan.items[0].toBuy).toBe(8)
    expect(update.baseline.aloo).toBe(12)
    expect(update.trace.join(' ')).toContain('Deterministic draft')
  })
})

describe('chaat multi-item consistency', () => {
  it('splits items correctly between buy list and sufficient stock', () => {
    const draft = computeDraftPlan({
      stallType: 'chaat',
      items: ['aloo', 'imli chutney', 'sev'],
      inventory: { sev: { quantity: 10, unit: 'kg' } },
      multiplier: { weather: 1, event: 1, weekday: 1 },
      signals: {},
      bias: {},
    })
    expect(draft.items.map((item) => item.item)).toEqual(['aloo', 'imli chutney'])
    expect(draft.sufficientStockItems).toEqual(['sev'])
  })
})
