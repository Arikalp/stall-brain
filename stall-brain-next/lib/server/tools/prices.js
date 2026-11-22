import { z } from 'zod'
import { tool } from '@langchain/core/tools'
import { mockMandiPrices } from '../data/prices.js'
import { todayIso } from '../utils/dates.js'
import { config } from '../config.js'
import { cachedLookup } from '../utils/cache.js'

/**
 * Mandi prices for key ingredients. With DATA_GOV_IN_API_KEY configured, pulls
 * Agmarknet daily prices from data.gov.in; otherwise returns the MOCK fixture
 * (src/data/prices.js), with every row labeled isMock: true and shown as mock
 * in the UI per project rules.
 */

const AGMARKNET_RESOURCE = '9ef84268-d588-465a-a308-a864a43d0070' // Current daily price of various commodities (Agmarknet)

/** Mock prices for the requested items (or all). Pure. */
export function lookupMockPrices({ items, prices = mockMandiPrices } = {}) {
  const wanted = items?.map((item) => item.trim().toLowerCase()).filter(Boolean)
  const hits = prices.filter((price) => !wanted || wanted.includes(price.item.toLowerCase()))
  return hits.map((price) => ({
    ...price,
    source: 'mock-mandi-fixture',
    isMock: true,
  }))
}

/**
 * data.gov.in Agmarknet fetch. Throws on failure so the caller records it in
 * signals.errors and falls back to the mock fixture.
 */
export async function fetchAgmarknetPrices({ items, apiKey, fetchImpl = fetch } = {}) {
  const params = new URLSearchParams({
    'api-key': apiKey,
    format: 'json',
    limit: String(Math.max(500, (items?.length ?? 0) * 60)),
    filters: 'state=Lucknow', // Agmarknet district field; refined below if needed
  })

  const response = await fetchImpl(
    `https://api.data.gov.in/resource/${AGMARKNET_RESOURCE}?${params}`,
    { signal: AbortSignal.timeout(8000) },
  )
  if (!response.ok) {
    throw new Error(`data.gov.in responded ${response.status}`)
  }

  const payload = await response.json()
  const records = payload?.records ?? []
  const wanted = items?.map((item) => item.trim().toLowerCase()) ?? []
  const seen = new Set()

  const mapped = records
    .map((record) => ({
      item: String(record.commodity ?? '').trim().toLowerCase(),
      pricePerUnit: Number.parseFloat(record.modal_price ?? record.min_price),
      unit: String(record.unit ?? 'kg').replace(/^per\s*/i, ''),
      source: 'agmarknet-datagovin',
      isMock: false,
    }))
    .filter(
      (price) =>
        price.item &&
        Number.isFinite(price.pricePerUnit) &&
        (!wanted.length || wanted.includes(price.item)) &&
        !seen.has(price.item) &&
        seen.add(price.item),
    )

  if (!mapped.length) {
    throw new Error('data.gov.in returned no usable price records')
  }
  return mapped
}

export async function getMandiPrices({ items, apiKey, fetchImpl = fetch } = {}) {
  const key = apiKey ?? config.dataGovInApiKey
  if (key) {
    try {
      const cacheKey = `mandi:${todayIso()}:${(items ?? []).join(',').toLowerCase()}`
      const real = await cachedLookup(
        cacheKey,
        () =>
          fetchAgmarknetPrices({
            items,
            apiKey: key,
            fetchImpl,
          }),
        { bypass: fetchImpl !== fetch },
      )
      return { prices: real, isMock: false, note: 'Live Agmarknet prices via data.gov.in.' }
    } catch (error) {
      return {
        prices: lookupMockPrices({ items }),
        isMock: true,
        note: `Live prices unavailable (${error.message}); using MOCK fixture.`,
      }
    }
  }

  return {
    prices: lookupMockPrices({ items }),
    isMock: true,
    note: 'MOCK mandi prices (no DATA_GOV_IN_API_KEY configured). Verify before trusting.',
  }
}

export const getMandiPricesTool = tool(
  async ({ items }) => JSON.stringify(await getMandiPrices({ items })),
  {
    name: 'getMandiPrices',
    description:
      'Get wholesale mandi prices in INR for ingredients (potatoes, milk, marigold, etc.). Pass the vendor item names you need prices for. Currently returns clearly-labeled MOCK prices.',
    schema: z.object({
      items: z.array(z.string().min(1)).optional(),
    }),
  },
)
