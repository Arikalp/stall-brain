import { describe, expect, it } from 'vitest'
import {
  DailyLogSchema,
  DraftPlanSchema,
  ForecastRequestSchema,
  ForecastResultSchema,
  SignalsSchema,
  UserProfileSchema,
  normalizeLlmForecast,
} from '../src/schemas.js'

const validForecastResult = {
  summary: 'Rainy Monday, lower footfall.',
  hindiSummary: 'बारिश वाला सोमवार, भीड़ कम रहेगी।',
  expectedCustomers: 40,
  peakHours: '12-2pm and 6-9pm',
  confidenceLevel: 'Medium',
  confidenceReason: 'Rain reduces walk-ins.',
  procurementList: [
    {
      item: 'aloo',
      totalNeeded: '12 kg',
      alreadyHave: '4 kg',
      toBuy: '8 kg',
      unit: 'kg',
      priority: 'essential',
    },
  ],
  sufficientStockItems: ['imli chutney'],
  specialAdvice: 'Keep the chaat covered. || चाट को ढक कर रखें।',
}

describe('ForecastResultSchema', () => {
  it('accepts the shape the frontend consumes', () => {
    const parsed = ForecastResultSchema.parse(validForecastResult)
    expect(parsed.procurementList[0].toBuy).toBe('8 kg')
  })

  it('rejects invalid priority values', () => {
    const bad = {
      ...validForecastResult,
      procurementList: [
        { ...validForecastResult.procurementList[0], priority: 'urgent' },
      ],
    }
    expect(() => ForecastResultSchema.parse(bad)).toThrow()
  })

  it('rejects non-numeric expectedCustomers', () => {
    const bad = { ...validForecastResult, expectedCustomers: 'many' }
    expect(() => ForecastResultSchema.parse(normalizeLlmForecast(bad))).toThrow()
  })

  it('normalizes common LLM quirks before validation', () => {
    const raw = {
      ...validForecastResult,
      expectedCustomers: '42',
      confidenceLevel: 'high',
      procurementList: [
        { ...validForecastResult.procurementList[0], priority: 'ESSENTIAL' },
      ],
    }
    const parsed = ForecastResultSchema.parse(normalizeLlmForecast(raw))
    expect(parsed.expectedCustomers).toBe(42)
    expect(parsed.confidenceLevel).toBe('High')
    expect(parsed.procurementList[0].priority).toBe('essential')
  })

  it('accepts "note": null from the model (LangChain parses first) and cleans it up', () => {
    const raw = {
      ...validForecastResult,
      procurementList: [
        { ...validForecastResult.procurementList[0], note: null },
      ],
    }
    // The raw schema tolerates null so LangChain's internal parser does not throw...
    expect(() => ForecastResultSchema.parse(raw)).not.toThrow()
    // ...and normalizeLlmForecast removes the null note entirely.
    const parsed = ForecastResultSchema.parse(normalizeLlmForecast(raw))
    expect('note' in parsed.procurementList[0]).toBe(false)
  })
})

describe('ForecastRequestSchema', () => {
  const validRequest = {
    stall: { id: 'chaat', name: 'Chaat Stall', items: ['aloo'] },
    items: ['aloo'],
    inventory: { aloo: { quantity: 4, unit: 'kg' } },
    dateLabel: '12 November 2026',
    dayName: 'Thursday',
    weather: { temperature: 28 },
    weatherSignal: { label: 'Clear & Sunny ☀️', footfallImpact: 1.2 },
    weeklyMultiplier: 1,
    eventMultiplier: 1,
    demandMultiplier: 1.2,
  }

  it('accepts a well-formed request', () => {
    const parsed = ForecastRequestSchema.parse(validRequest)
    expect(parsed.inventory.aloo.quantity).toBe(4)
  })

  it('rejects a request missing weather', () => {
    const { weather, ...bad } = validRequest
    expect(() => ForecastRequestSchema.parse(bad)).toThrow()
  })
})

describe('UserProfileSchema', () => {
  it('matches the frontend profile shape', () => {
    const profile = {
      stallType: 'chaat',
      stallLabel: 'Chaat Stall',
      stallEmoji: '🥙',
      ingredients: ['aloo', 'puri'],
    }
    expect(UserProfileSchema.parse(profile).ingredients).toHaveLength(2)
  })
})

describe('SignalsSchema', () => {
  it('defaults collections and allows tool errors', () => {
    const signals = SignalsSchema.parse({
      weather: { label: 'Rain / Drizzle 🌧️', footfallImpact: 0.7 },
      errors: ['getWeather timeout'],
    })
    expect(signals.events).toEqual([])
    expect(signals.errors).toHaveLength(1)
  })
})

describe('DraftPlanSchema', () => {
  it('accepts a deterministic draft', () => {
    const draft = {
      items: [
        {
          item: 'aloo',
          unit: 'kg',
          baseline: 10,
          bias: 1,
          totalNeeded: 12,
          alreadyHave: 4,
          toBuy: 8,
        },
      ],
      sufficientStockItems: [],
      combinedMultiplier: 1.2,
    }
    expect(DraftPlanSchema.parse(draft).items[0].toBuy).toBe(8)
  })

  it('rejects negative quantities', () => {
    const draft = {
      items: [
        {
          item: 'aloo',
          unit: 'kg',
          baseline: 10,
          totalNeeded: -1,
          alreadyHave: 0,
          toBuy: 0,
        },
      ],
    }
    expect(() => DraftPlanSchema.parse(draft)).toThrow()
  })
})

describe('DailyLogSchema', () => {
  it('accepts an end-of-day log', () => {
    const log = {
      vendorId: 'vendor-1',
      date: '2026-11-12',
      items: [{ item: 'aloo', outcome: 'sold_out' }],
      customers: 55,
    }
    expect(DailyLogSchema.parse(log).items[0].outcome).toBe('sold_out')
  })

  it('rejects unknown outcomes', () => {
    const log = {
      vendorId: 'vendor-1',
      date: '2026-11-12',
      items: [{ item: 'aloo', outcome: 'fine' }],
    }
    expect(() => DailyLogSchema.parse(log)).toThrow()
  })
})
