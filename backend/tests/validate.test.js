import { describe, expect, it } from 'vitest'
import {
  buildFallbackPlan,
  parseQuantity,
  validatePlan,
} from '../src/graph/nodes/validate.js'

const draftPlan = {
  items: [
    {
      item: 'aloo',
      unit: 'kg',
      baseline: 12,
      bias: 1,
      totalNeeded: 14.4,
      alreadyHave: 4,
      toBuy: 10.4,
    },
    {
      item: 'imli chutney',
      unit: 'litres',
      baseline: 4,
      bias: 1,
      totalNeeded: 4.8,
      alreadyHave: 0,
      toBuy: 4.8,
    },
  ],
  sufficientStockItems: [],
  expectedCustomers: 180,
}

const goodPlan = {
  summary: 'ok',
  hindiSummary: 'ठीक',
  expectedCustomers: 180,
  peakHours: '12-2pm',
  confidenceLevel: 'High',
  confidenceReason: 'all good',
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
      item: 'imli chutney',
      totalNeeded: '4.8 litres',
      alreadyHave: '0 litres',
      toBuy: '4.8 litres',
      unit: 'litres',
      priority: 'moderate',
    },
  ],
  sufficientStockItems: [],
  specialAdvice: 'ok || ठीक',
}

const base = {
  draftPlan,
  sessionIngredients: ['aloo', 'imli chutney'],
  budgetInr: null,
  prices: [],
}

describe('parseQuantity', () => {
  it('parses value+unit and bare numbers', () => {
    expect(parseQuantity('12 kg')).toEqual({ value: 12, unit: 'kg' })
    expect(parseQuantity('0.5 litre')).toEqual({ value: 0.5, unit: 'litre' })
    expect(parseQuantity(8)).toEqual({ value: 8, unit: null })
    expect(parseQuantity('many')).toBeNull()
    expect(parseQuantity('12 kg.')).toEqual({ value: 12, unit: 'kg' })
  })
})

describe('validatePlan', () => {
  it('accepts a plan consistent with the draft', () => {
    const result = validatePlan({ plan: goodPlan, ...base })
    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
  })

  it('rejects broken toBuy arithmetic', () => {
    const bad = {
      ...goodPlan,
      procurementList: [
        { ...goodPlan.procurementList[0], toBuy: '20 kg' },
        goodPlan.procurementList[1],
      ],
    }
    const result = validatePlan({ plan: bad, ...base })
    expect(result.valid).toBe(false)
    expect(result.errors.some((error) => error.includes('aloo'))).toBe(true)
  })

  it('rejects items missing from the plan', () => {
    const bad = {
      ...goodPlan,
      procurementList: [goodPlan.procurementList[0]],
      sufficientStockItems: [],
    }
    const result = validatePlan({ plan: bad, ...base })
    expect(result.errors.some((error) => error.includes('imli chutney'))).toBe(true)
  })

  it('rejects an item in both lists', () => {
    const bad = { ...goodPlan, sufficientStockItems: ['aloo'] }
    const result = validatePlan({ plan: bad, ...base })
    expect(
      result.errors.some((error) => error.includes('both procurementList')),
    ).toBe(true)
  })

  it('accepts sufficient-stock items and rejects plan gaps', () => {
    const ok = {
      ...goodPlan,
      procurementList: [goodPlan.procurementList[0]],
      sufficientStockItems: ['Imli Chutney'],
    }
    expect(validatePlan({ plan: ok, ...base }).valid).toBe(true)
  })

  it('rejects adjustments beyond the +/-25% band', () => {
    const bad = {
      ...goodPlan,
      procurementList: [
        { ...goodPlan.procurementList[0], totalNeeded: '30 kg', toBuy: '26 kg' },
        goodPlan.procurementList[1],
      ],
    }
    const result = validatePlan({ plan: bad, ...base })
    expect(result.errors.some((error) => error.includes('25%'))).toBe(true)
  })

  it('rejects unit mismatches with the vendor profile', () => {
    const bad = {
      ...goodPlan,
      procurementList: [
        { ...goodPlan.procurementList[0], unit: 'pieces' },
        goodPlan.procurementList[1],
      ],
    }
    const result = validatePlan({ plan: bad, ...base })
    expect(result.errors.some((error) => error.includes('unit'))).toBe(true)
  })

  it('rejects negative quantities', () => {
    const bad = {
      ...goodPlan,
      procurementList: [
        { ...goodPlan.procurementList[0], alreadyHave: '-4 kg' },
        goodPlan.procurementList[1],
      ],
    }
    const result = validatePlan({ plan: bad, ...base })
    expect(result.errors.some((error) => error.includes('Negative'))).toBe(true)
  })

  it('rejects a missing plan', () => {
    const result = validatePlan({ plan: null, ...base })
    expect(result.valid).toBe(false)
  })

  it('demotes confidence when live signals failed (degraded-signal rule)', () => {
    const result = validatePlan({
      plan: { ...goodPlan, confidenceLevel: 'High' },
      ...base,
      signalErrors: ['getWeather: network down'],
    })
    expect(result.valid).toBe(false)
    expect(result.errors.some((error) => error.includes('confidenceLevel'))).toBe(true)

    const ok = validatePlan({
      plan: { ...goodPlan, confidenceLevel: 'Medium' },
      ...base,
      signalErrors: ['getWeather: network down'],
    })
    expect(ok.valid).toBe(true)
  })
})

describe('buildFallbackPlan', () => {
  it('converts the deterministic draft into a low-confidence ForecastResult', () => {
    const fallback = buildFallbackPlan(draftPlan, { combined: 1.2 })
    expect(fallback.confidenceLevel).toBe('Low')
    expect(fallback.procurementList[0]).toEqual({
      item: 'aloo',
      totalNeeded: '14.4 kg',
      alreadyHave: '4 kg',
      toBuy: '10.4 kg',
      unit: 'kg',
      priority: 'essential',
      note: 'Deterministic fallback plan.',
    })
    expect(fallback.hindiSummary.length).toBeGreaterThan(0)
  })
})
