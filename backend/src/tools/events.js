import { z } from 'zod'
import { tool } from '@langchain/core/tools'
import {
  EVENT_WINDOW_DAYS,
  festivals,
  localEvents,
  weddingSeasonWindows,
} from '../data/festivals.js'
import { addDays, impactLevel, todayIso } from '../utils/dates.js'

/**
 * Curated local events + festival calendar for Hazratganj, Lucknow.
 * Sources: src/data/festivals.js, with a web-search fallback handled by
 * gatherSignals when search is configured. No network calls here, so these
 * tools never hard-fail; un-curated happenings arrive via the webSearch tool.
 */

/** Days within [start..end] (inclusive ISO strings) that the window covers. */
export function datesInWindow(windowDates, start, end) {
  return windowDates.filter((date) => date >= start && date <= end)
}

function windowDatesFor(today) {
  return Array.from({ length: EVENT_WINDOW_DAYS + 1 }, (_, i) => addDays(today, i))
}

/** Festivals in today..+3 days, with footfall level. Pure. */
export function lookupFestivals({ today, calendar = festivals } = {}) {
  const windowDates = windowDatesFor(today)
  const hits = calendar
    .filter((festival) => windowDates.includes(festival.date))
    .map((festival) => ({
      name: festival.name,
      date: festival.date,
      expectedFootfall: impactLevel(festival.impactMultiplier),
      approximate: Boolean(festival.approximate),
      source: 'curated-festival-calendar',
      isMock: false,
    }))

  // Wedding season matters only around today (it spans weeks; lookahead is short).
  const todayNear = [addDays(today, -1), today, addDays(today, 1)]
  // NOTE: datesInWindow returns an array, and an empty array is truthy -
  // compare its length so the season only counts when it actually overlaps.
  const wedding = weddingSeasonWindows.find(
    (window) => datesInWindow(todayNear, window.start, window.end).length > 0,
  )

  return {
    windowDays: EVENT_WINDOW_DAYS,
    festivals: hits,
    weddingSeason: wedding
      ? { name: wedding.name, date: today, expectedFootfall: 'medium', source: 'curated-festival-calendar', isMock: false }
      : null,
  }
}

/** Local melas/fairs/expos in today..+3 days. Pure. */
export function lookupLocalEvents({ today, events = localEvents } = {}) {
  const windowDates = windowDatesFor(today)
  const hits = events
    .filter((event) => windowDates.includes(event.date))
    .map((event) => ({
      name: event.name,
      date: event.date,
      distanceKm: event.distanceKm,
      expectedFootfall: impactLevel(event.impactMultiplier),
      source: 'curated-local-events',
      isMock: false,
    }))

  return { windowDays: EVENT_WINDOW_DAYS, events: hits }
}

const DateInput = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

export const getFestivalsTool = tool(
  async ({ date }) => JSON.stringify(lookupFestivals({ today: date ?? todayIso() })),
  {
    name: 'getFestivals',
    description:
      'Get Hindu and Islamic festival dates, local melas and wedding season in Lucknow (today + 3 days), with expected footfall effect. Critical for flower vendors (pooja/wedding demand) and useful for most stalls.',
    schema: DateInput,
  },
)

export const getLocalEventsTool = tool(
  async ({ date }) => JSON.stringify(lookupLocalEvents({ today: date ?? todayIso() })),
  {
    name: 'getLocalEvents',
    description:
      'Get local market fairs, expos and melas near Hazratganj (today + 3 days) with distance and expected footfall. Useful for snacks, chaat, balloons and toy sellers.',
    schema: DateInput,
  },
)
