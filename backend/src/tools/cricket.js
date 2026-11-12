import { z } from 'zod'
import { tool } from '@langchain/core/tools'
import { mockEkanaFixtures } from '../data/cricket.js'
import { todayIso } from '../utils/dates.js'

/**
 * Ekana Stadium (Lucknow) cricket fixtures. Currently backed by a MOCK
 * fixture (src/data/cricket.js) because no free fixture API covers IPL +
 * international matches without a key; every result is labeled isMock: true.
 * Swap `fetchEkanaFixtures` internals for a real provider later - the tool
 * contract stays the same.
 */

/** Fixtures within today..+3 days. Pure. */
export function lookupCricketFixtures({ today, fixtures = mockEkanaFixtures, windowDays = 3 } = {}) {
  const windowDates = Array.from({ length: windowDays + 1 }, (_, i) => {
    const [y, m, d] = today.split('-').map(Number)
    return new Date(Date.UTC(y, m - 1, d + i)).toISOString().slice(0, 10)
  })

  return {
    windowDays,
    isMock: true,
    note: 'Fixture data is a curated MOCK - verify before relying on it.',
    matches: fixtures
      .filter((fixture) => windowDates.includes(fixture.date))
      .map((fixture) => ({ ...fixture, isMock: true, source: 'mock-fixture' })),
  }
}

export const getCricketScheduleTool = tool(
  async ({ date }) => JSON.stringify(lookupCricketFixtures({ today: date ?? todayIso() })),
  {
    name: 'getCricketSchedule',
    description:
      'Get Ekana Stadium (Lucknow) cricket fixtures in the next 3 days (IPL/domestic/international) with expected crowd levels. Important for snacks, chai and balloon stalls on match days.',
    schema: z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }),
  },
)
