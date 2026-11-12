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
