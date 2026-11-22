import { z } from 'zod'
import { tool } from '@langchain/core/tools'
import { config } from '../config.js'

/**
 * Web search for recent local news / social buzz (viral food trends, road
 * closures, sudden melas). Uses the Tavily REST API when TAVILY_API_KEY is
 * configured; otherwise reports itself unavailable so the agent can proceed
 * with the other tools (never a hard failure).
 */

export async function searchWeb({ query, days = 3, fetchImpl = fetch, apiKey } = {}) {
  const key = apiKey ?? config.tavilyApiKey
  if (!key) {
    return {
      available: false,
      results: [],
      note: 'Web search not configured (missing TAVILY_API_KEY).',
    }
  }

  const response = await fetchImpl('https://api.tavily.com/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      query,
      topic: 'news',
      days,
      max_results: 5,
      include_answer: false,
    }),
    signal: AbortSignal.timeout(8000),
  })

  if (!response.ok) {
    throw new Error(`Tavily responded ${response.status}`)
  }

  const payload = await response.json()
  return {
    available: true,
    results: (payload?.results ?? []).map((result) => ({
      title: result.title,
      snippet: result.content?.slice(0, 300) ?? '',
      url: result.url,
      published: result.published_date ?? null,
    })),
  }
}

export function detectSocialSpike(results = [], { location = 'Hazratganj' } = {}) {
  const positiveRe = /\b(viral|trending|crowd|crowds|bheed|rush|food\s*walk|foodwalk|mela|fair|jam[-\s]?packed|packed|festival|meetup|concert|carnival)\b|#hazratganj|#lucknowfoodies|#lucknowdiaries|#streetfoodlucknow/i
  const closureRe = /\b(road\s*closed|traffic\s*diversion|bandh|curfew|strike|market\s*closed|shut)\b/i

  const topics = []
  let positiveHits = 0
  let closureHits = 0

  for (const item of results) {
    const text = `${item.title ?? ''} ${item.snippet ?? ''}`.trim()
    if (!text) continue
    const hashtags = text.match(/#[A-Za-z0-9_]+/g) ?? []
    for (const tag of hashtags) {
      if (!topics.includes(tag)) topics.push(tag)
    }
    if (positiveRe.test(text)) {
      positiveHits += 1
      if (topics.length < 4 && item.title) topics.push(item.title.slice(0, 60))
    }
    if (closureRe.test(text)) {
      closureHits += 1
    }
  }

  if (closureHits > positiveHits && closureHits > 0) {
    return {
      hasSpike: true,
      direction: 'down',
      factor: 0.85,
      label: `Traffic disruption / closure buzz around ${location}`,
      topics: topics.slice(0, 5),
      summary: `Social & local alerts mention closures/diversions near ${location}; expect lower walk-in footfall.`,
    }
  }

  if (positiveHits > 0) {
    return {
      hasSpike: true,
      direction: 'up',
      factor: 1.1,
      label: `Social buzz spike near ${location}`,
      topics: topics.slice(0, 5),
      summary: `Trending local posts (${topics.slice(0, 3).join(', ') || location}) point to higher evening crowd.`,
    }
  }

  return {
    hasSpike: false,
    direction: 'neutral',
    factor: 1.0,
    label: `Normal social activity near ${location}`,
    topics: topics.slice(0, 3),
    summary: `No unusual viral crowd spike or closure alert detected for ${location}.`,
  }
}

export async function fetchSocialBuzz({ location = 'Hazratganj', fetchImpl = fetch, apiKey } = {}) {
  const query = `(${location} OR #Hazratganj OR #LucknowFoodies) Lucknow street food crowd OR viral OR event OR road closure`
  try {
    const searchResult = await searchWeb({ query, days: 3, fetchImpl, apiKey })
    if (!searchResult.available) {
      return {
        hasSpike: false,
        direction: 'neutral',
        factor: 1.0,
        label: `Social buzz unavailable (${location})`,
        topics: [],
        summary: searchResult.note,
        source: 'tavily',
        available: false,
        isMock: true,
      }
    }
    const spike = detectSocialSpike(searchResult.results, { location })
    return {
      ...spike,
      source: 'tavily',
      available: true,
      isMock: false,
      resultCount: searchResult.results.length,
    }
  } catch (err) {
    return {
      hasSpike: false,
      direction: 'neutral',
      factor: 1.0,
      label: `Social buzz check failed (${location})`,
      topics: [],
      summary: `Social search degraded: ${err.message}`,
      source: 'tavily',
      available: false,
      isMock: true,
    }
  }
}

export const webSearchTool = tool(
  async ({ query }) => JSON.stringify(await searchWeb({ query })),
  {
    name: 'webSearch',
    description:
      'Search recent news and social buzz for Lucknow/Hazratganj (viral food trends, road closures, sudden crowds, new melas). Use once with a specific query when other signals look unusual or incomplete.',
    schema: z.object({
      query: z.string().min(3),
    }),
  },
)

export const getSocialBuzzTool = tool(
  async ({ location }) => JSON.stringify(await fetchSocialBuzz({ location })),
  {
    name: 'getSocialBuzz',
    description:
      'Scan public hashtags and local news (#Hazratganj, #LucknowFoodies) for sudden social crowd spikes or traffic closures around the stall location.',
    schema: z.object({
      location: z.string().default('Hazratganj'),
    }),
  },
)
