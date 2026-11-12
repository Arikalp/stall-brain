import { describe, expect, it } from 'vitest'
import { mapWeatherCode } from '../src/tools/weather.js'
import { lookupFestivals, lookupLocalEvents } from '../src/tools/events.js'
import { lookupCricketFixtures } from '../src/tools/cricket.js'
import { getMandiPrices, lookupMockPrices } from '../src/tools/prices.js'
import { searchWeb } from '../src/tools/search.js'
import { config } from '../src/config.js'

describe('getWeather mappings', () => {
  it('maps weather codes to footfall impact', () => {
    expect(mapWeatherCode(0).footfallImpact).toBe(1.2)
    expect(mapWeatherCode(61).label).toContain('Rain')
    expect(mapWeatherCode(95).footfallImpact).toBe(0.4)
    expect(mapWeatherCode(9999).footfallImpact).toBe(1)
  })
})

describe('getFestivals / getLocalEvents (curated)', () => {
  it('finds festivals inside the 3-day window', () => {
    // Diwali is 2026-11-08 in the curated calendar.
    const result = lookupFestivals({ today: '2026-11-07' })
    expect(result.festivals.map((festival) => festival.name)).toContain('Diwali')
    expect(result.festivals[0].expectedFootfall).toBe('high')
  })

  it('returns nothing outside any window', () => {
    const result = lookupFestivals({ today: '2026-06-10' })
    expect(result.festivals).toEqual([])
    expect(result.weddingSeason).toBeNull()
  })

  it('detects wedding season only near today', () => {
    const peak = lookupFestivals({ today: '2026-11-20' })
    expect(peak.weddingSeason?.name).toContain('Peak')

    const offSeason = lookupFestivals({ today: '2026-05-20' })
    expect(offSeason.weddingSeason).toBeNull()
  })

  it('finds local events with distance', () => {
    const result = lookupLocalEvents({ today: '2026-11-01' })
    expect(result.events[0].name).toBe('Lucknow Design Bazaar')
    expect(result.events[0].distanceKm).toBe(1)
    expect(result.events[0].expectedFootfall).toBe('medium')
  })
})

describe('getCricketSchedule (mock)', () => {
  it('finds matches in the window and labels them as mock', () => {
    const result = lookupCricketFixtures({ today: '2026-04-04' })
    expect(result.isMock).toBe(true)
    expect(result.matches[0].teams).toBe('LSG vs CSK')
    expect(result.matches[0].isMock).toBe(true)
  })

  it('returns no matches outside the window', () => {
    const result = lookupCricketFixtures({ today: '2026-07-01' })
    expect(result.matches).toEqual([])
  })
})

describe('getMandiPrices', () => {
  it('returns clearly-labeled mock prices without an API key', async () => {
    if (config.dataGovInApiKey) return // skip when a real key is configured
    const result = await getMandiPrices({ items: ['aloo', 'milk'] })
    expect(result.isMock).toBe(true)
    expect(result.prices.map((price) => price.item)).toEqual(['aloo', 'milk'])
    expect(result.prices.every((price) => price.isMock)).toBe(true)
  })

  it('falls back to mock when the real API fails', async () => {
    const result = await getMandiPrices({
      items: ['aloo'],
      apiKey: 'fake-key',
      fetchImpl: async () => ({ ok: false, status: 503 }),
    })
    expect(result.isMock).toBe(true)
    expect(result.note).toContain('unavailable')
  })

  it('lookupMockPrices filters and labels', () => {
    const prices = lookupMockPrices({ items: ['Aloo '] })
    expect(prices).toHaveLength(1)
    expect(prices[0].isMock).toBe(true)
    expect(prices[0].source).toBe('mock-mandi-fixture')
  })
})

describe('webSearch', () => {
  it('reports unavailable without an API key', async () => {
    if (config.tavilyApiKey) return // skip when a real key is configured
    const result = await searchWeb({ query: 'Lucknow news' })
    expect(result.available).toBe(false)
    expect(result.results).toEqual([])
  })

  it('maps Tavily results when configured', async () => {
    const fakeFetch = async () => ({
      ok: true,
      json: async () => ({
        results: [{ title: 'Ganjing returns', content: 'x'.repeat(400), url: 'u' }],
      }),
    })
    const result = await searchWeb({ query: 'Hazratganj', apiKey: 'tvly-test', fetchImpl: fakeFetch })
    expect(result.available).toBe(true)
    expect(result.results[0].snippet).toHaveLength(300)
  })

  it('throws on Tavily failure so the caller records it', async () => {
    await expect(
      searchWeb({ query: 'Hazratganj', apiKey: 'tvly-test', fetchImpl: async () => ({ ok: false, status: 500 }) }),
    ).rejects.toThrow('Tavily responded 500')
  })
})
