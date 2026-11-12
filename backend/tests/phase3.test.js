import { beforeEach, describe, expect, it } from 'vitest'
import { getShelfLifeEntry, stallBaselines } from '../src/data/baselines.js'
import { fetchWeatherSignal } from '../src/tools/weather.js'
import { detectSocialSpike, fetchSocialBuzz } from '../src/tools/search.js'
import {
  applySignalOverrides,
  buildSignalsFromOutputs,
} from '../src/graph/nodes/gatherSignals.js'
import {
  analyzeTomorrowLookahead,
  computeDraftPlan,
  getPerishableCap,
} from '../src/graph/nodes/forecast.js'
import { validatePlan } from '../src/graph/nodes/validate.js'
import { buildTomorrowOutlook } from '../src/graph/nodes/explain.js'
import { humanApproval } from '../src/graph/nodes/humanApproval.js'
import { save } from '../src/graph/nodes/save.js'
import {
  formatCompactHindiMessage,
  parseWhatsappReply,
  runMorningWhatsAppJob,
} from '../src/jobs/whatsappMorning.js'
import { extractIncomingMessage } from '../src/routes/whatsapp.js'
import {
  clearInMemoryGroupDemand,
  getGroupDemand,
  recordGroupDemand,
} from '../src/store/firestore.js'

describe('T3.3 Shelf-life & spoilage awareness', () => {
  it('defines perishable and shelfLifeDays metadata across stall baselines', () => {
    expect(stallBaselines.chai.milk).toMatchObject({ perishable: true, shelfLifeDays: 1 })
    expect(stallBaselines.chaat.dahi).toMatchObject({ perishable: true, shelfLifeDays: 2 })
    expect(stallBaselines.chai.sugar).toMatchObject({ perishable: false, shelfLifeDays: 90 })
    expect(getShelfLifeEntry('roses', 'flowers')).toMatchObject({
      perishable: true,
      shelfLifeDays: 1,
    })
  })

  it('caps 1-day perishables so stacked bias + festival multipliers cannot overbuy', () => {
    const draft = computeDraftPlan({
      stallType: 'chai',
      items: ['milk', 'sugar'],
      inventory: {},
      multiplier: { weather: 1.2, event: 1.2, weekday: 1.1 },
      signals: { festivals: [{ name: 'Diwali', impact: 'high' }] },
      bias: { milk: 1.8, sugar: 1.0 },
    })
    const milk = draft.items.find((i) => i.item === 'milk')
    // milk baseline=20, 1-day cap=30 (1.5x) rather than 20 * 2.21 * 1.8 = 79.8
    expect(milk.totalNeeded).toBeLessThanOrEqual(30)
    expect(draft.spoilageGuardApplied).toBe(true)
    expect(draft.perishableNotes.some((n) => n.includes('milk'))).toBe(true)
  })

  it('validator rejects a plan whose perishable quantity exceeds shelf-life cap', () => {
    const draftPlan = computeDraftPlan({
      stallType: 'chai',
      items: ['milk'],
      inventory: {},
      multiplier: { weather: 1, event: 1, weekday: 1 },
      signals: {},
      bias: {},
    })
    const badPlan = {
      summary: 'Buy 50L milk',
      hindiSummary: '50 लीटर दूध खरीदें',
      expectedCustomers: 150,
      peakHours: '8-11am',
      confidenceLevel: 'High',
      confidenceReason: 'Normal day',
      procurementList: [
        {
          item: 'milk',
          totalNeeded: '50 litres',
          alreadyHave: '0 litres',
          toBuy: '50 litres',
          unit: 'litres',
          priority: 'essential',
          note: '',
        },
      ],
      sufficientStockItems: [],
      specialAdvice: 'Sell fresh tea || ताज़ा चाय बेचें',
    }
    const validation = validatePlan({
      plan: badPlan,
      draftPlan,
      sessionIngredients: ['milk'],
      stallType: 'chai',
      signals: {},
    })
    expect(validation.valid).toBe(false)
    expect(validation.errors.some((e) => e.toLowerCase().includes('shelf-life cap'))).toBe(true)
  })
})

describe('T3.4 Multi-day lookahead & tomorrowOutlook', () => {
  it('parses a 3-day lookahead from Open-Meteo response', async () => {
    const hours = Array.from({ length: 72 }, (_, idx) => {
      const dayOffset = Math.floor(idx / 24)
      const dateStr = `2026-11-${12 + dayOffset}`
      const hh = String(idx % 24).padStart(2, '0')
      return `${dateStr}T${hh}:00`
    })
    const fakeFetch = async (url) => {
      expect(url).toContain('forecast_days=3')
      return {
        ok: true,
        json: async () => ({
          hourly: {
            time: hours,
            temperature_2m: hours.map(() => 29),
            weather_code: hours.map((_, idx) => (idx >= 24 && idx < 48 ? 63 : 0)),
            precipitation_probability: hours.map((_, idx) => (idx >= 24 && idx < 48 ? 80 : 10)),
          },
        }),
      }
    }
    const weather = await fetchWeatherSignal({ date: '2026-11-12', fetchImpl: fakeFetch })
    expect(weather.lookahead).toHaveLength(3)
    expect(weather.lookahead[0].date).toBe('2026-11-12')
    expect(weather.lookahead[1].date).toBe('2026-11-13')
    expect(weather.lookahead[1].rainProbabilityPeak).toBe(80)
  })

  it('reduces today short-life perishables when tomorrow has heavy rain in lookahead', () => {
    const baseDraft = computeDraftPlan({
      stallType: 'chaat',
      items: ['dahi'],
      inventory: {},
      multiplier: { weather: 1.1, event: 1, weekday: 1 },
      signals: { lookahead: [{ date: '2026-11-12' }, { date: '2026-11-13', weather: { label: 'Sunny', footfallImpact: 1.1, rainProbabilityPeak: 5 } }] },
      bias: {},
    })
    const rainyTomorrowDraft = computeDraftPlan({
      stallType: 'chaat',
      items: ['dahi'],
      inventory: {},
      multiplier: { weather: 1.1, event: 1, weekday: 1 },
      signals: {
        lookahead: [
          { date: '2026-11-12', weather: { label: 'Sunny', footfallImpact: 1.1 } },
          { date: '2026-11-13', weather: { label: 'Heavy Rain', footfallImpact: 0.65, rainProbabilityPeak: 85 } },
        ],
      },
      bias: {},
    })
    expect(rainyTomorrowDraft.items[0].totalNeeded).toBeLessThan(baseDraft.items[0].totalNeeded)
    expect(analyzeTomorrowLookahead({ lookahead: [{}, { weather: { footfallImpact: 0.65 } }] }).tomorrowBadWeather).toBe(true)
    expect(getPerishableCap({ baseline: 8, perishable: true, shelfLifeDays: 2 }, 1.1, { tomorrowBadWeather: true })).toBe(7.2)

    const outlook = buildTomorrowOutlook(
      {
        lookahead: [
          { date: '2026-11-12' },
          {
            date: '2026-11-13',
            weather: { label: 'Heavy Rain', footfallImpact: 0.65, rainProbabilityPeak: 85 },
            events: [],
            festivals: [],
          },
        ],
      },
      rainyTomorrowDraft,
    )
    expect(outlook).toContain('2026-11-13')
    expect(outlook).toContain('||')
  })
})

describe('T3.5 What-If Simulation Mode', () => {
  it('applies signal overrides deterministically and bypasses approval & persistence', async () => {
    const base = buildSignalsFromOutputs({
      outputs: [
        {
          name: 'getWeather',
          output: JSON.stringify({
            label: 'Clear',
            footfallImpact: 1.2,
            temperature: 29,
            lookahead: [{ date: '2026-11-12', label: 'Clear', footfallImpact: 1.2 }],
          }),
        },
      ],
      errors: [],
      today: '2026-11-12',
      dayName: 'Thursday',
      request: {},
    })

    const simulated = applySignalOverrides(
      base,
      {
        weatherLabel: 'Heavy Rain (5 PM)',
        weatherFootfallImpact: 0.65,
        eventName: 'Evening Mela',
        eventExpectedFootfall: 'high',
        socialSpike: true,
      },
      '2026-11-12',
    )
    expect(simulated.signals.weather.footfallImpact).toBe(0.65)
    expect(simulated.signals.events.some((e) => e.name === 'Evening Mela')).toBe(true)
    expect(simulated.multiplier.social).toBe(1.1)

    const approvalRes = await humanApproval({ simulation: true, plan: { summary: 'sim' } })
    expect(approvalRes.approvedPlan).toEqual({ summary: 'sim' })

    const saveRes = await save({ simulation: true, plan: { summary: 'sim' } })
    expect(saveRes.trace[0]).toContain('not saved')
  })
})

describe('T3.8 Crowd & Social Signals', () => {
  it('detects #Hazratganj viral crowd spike and applies modest boost to combined multiplier', () => {
    const spike = detectSocialSpike([
      {
        title: 'Weekend crowd rush at #Hazratganj food walk',
        snippet: 'Massive bheed expected tonight around #LucknowFoodies meetup',
      },
    ])
    expect(spike.hasSpike).toBe(true)
    expect(spike.factor).toBe(1.1)
    expect(spike.topics).toContain('#Hazratganj')

    const closure = detectSocialSpike([
      { title: 'Hazratganj road closed due to traffic diversion today', snippet: '' },
    ])
    expect(closure.direction).toBe('down')
    expect(closure.factor).toBe(0.85)

    const built = buildSignalsFromOutputs({
      outputs: [{ name: 'getSocialBuzz', output: JSON.stringify({ ...spike, available: true, isMock: false }) }],
      errors: [],
      today: '2026-11-12',
      dayName: 'Thursday',
      request: {},
    })
    expect(built.multiplier.social).toBe(1.1)
    expect(built.multiplier.combined).toBeCloseTo(1.1)
  })

  it('degrades gracefully to mock neutral result when TAVILY_API_KEY is missing', async () => {
    const res = await fetchSocialBuzz({ location: 'Hazratganj', apiKey: '' })
    expect(res.hasSpike).toBe(false)
    expect(res.factor).toBe(1.0)
    expect(res.isMock).toBe(true)
  })
})

describe('T3.6 WhatsApp morning delivery & reply webhook parsing', () => {
  it('formats a compact Hindi morning message and parses 1 / edit / STOP replies', () => {
    const msg = formatCompactHindiMessage({
      stallLabel: 'Sharma Chaat Bhandar',
      date: '2026-11-12',
      plan: {
        procurementList: [{ item: 'aloo', toBuy: '12 kg' }],
        financials: { totalCostInr: 300, expectedProfitInr: 450 },
      },
    })
    expect(msg).toContain('Sharma Chaat Bhandar')
    expect(msg).toContain('aloo: 12 kg')
    expect(msg).toContain('STOP')

    expect(parseWhatsappReply('1').action).toBe('approve')
    expect(parseWhatsappReply('STOP').action).toBe('opt_out')
    expect(parseWhatsappReply('aloo 15 kg, dahi 4 litres')).toEqual({
      action: 'edit',
      edits: [
        { item: 'aloo', quantity: 15, unit: 'kg' },
        { item: 'dahi', quantity: 4, unit: 'litres' },
      ],
      raw: 'aloo 15 kg, dahi 4 litres',
    })

    expect(
      extractIncomingMessage({
        entry: [{ changes: [{ value: { messages: [{ from: '919800000001', text: { body: '1' } }] } }] }],
      }),
    ).toEqual({ from: '919800000001', text: '1', source: 'meta' })
  })

  it('runs morning dispatch batch cleanly against mocked opted-in vendors', async () => {
    const fakeDb = {
      collection: () => ({
        where: () => ({
          get: async () => ({
            docs: [
              {
                id: 'v1',
                data: () => ({
                  profile: {
                    stallType: 'chai',
                    stallLabel: 'Ganj Chai',
                    ingredients: ['milk', 'sugar'],
                    whatsappOptIn: true,
                    whatsappPhone: '+919811111111',
                  },
                }),
              },
            ],
          }),
        }),
      }),
    }
    const batch = await runMorningWhatsAppJob({ db: fakeDb, date: '2026-11-12' })
    expect(batch.processed).toBe(1)
    expect(batch.results[0].sent).toBe(true)
    expect(batch.results[0].provider).toBe('dry-run')
    expect(batch.results[0].isMock).toBe(true)
  })
})

describe('T3.9 Group buying aggregation', () => {
  beforeEach(() => {
    clearInMemoryGroupDemand()
  })

  it('aggregates anonymized quantities across nearby vendors in the same lane', async () => {
    await recordGroupDemand(
      {
        vendorId: 'vendor-a',
        lane: 'Hazratganj',
        date: '2026-11-12',
        items: [{ item: 'aloo', toBuy: 12, unit: 'kg' }],
        optIn: true,
      },
      { db: null },
    )
    await recordGroupDemand(
      {
        vendorId: 'vendor-b',
        lane: 'Hazratganj',
        date: '2026-11-12',
        items: [{ item: 'aloo', toBuy: 18, unit: 'kg' }],
        optIn: true,
      },
      { db: null },
    )

    const snap = await getGroupDemand(
      {
        lane: 'Hazratganj',
        date: '2026-11-12',
        vendorId: 'vendor-a',
      },
      { db: null },
    )
    expect(snap.optedInVendors).toBe(2)
    expect(snap.youOptedIn).toBe(true)
    expect(snap.suggestions[0]).toMatchObject({
      item: 'aloo',
      vendorCount: 2,
      totalQuantity: 30,
      unit: 'kg',
      youJoined: true,
    })

    await recordGroupDemand(
      {
        vendorId: 'vendor-a',
        lane: 'Hazratganj',
        date: '2026-11-12',
        optIn: false,
      },
      { db: null },
    )
    const afterOptOut = await getGroupDemand(
      {
        lane: 'Hazratganj',
        date: '2026-11-12',
        vendorId: 'vendor-a',
      },
      { db: null },
    )
    expect(afterOptOut.optedInVendors).toBe(1)
    expect(afterOptOut.youOptedIn).toBe(false)
    expect(afterOptOut.suggestions[0].totalQuantity).toBe(18)
  })
})
