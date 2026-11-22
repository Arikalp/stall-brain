/** Date helpers for the Asia/Kolkata market day (used across tools and nodes). */

const IST = 'Asia/Kolkata'

/** Today's date as YYYY-MM-DD in Asia/Kolkata. */
export function todayIso() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: IST }).format(new Date())
}

/** ISO date N days from a YYYY-MM-DD date. */
export function addDays(isoDate, days) {
  const [y, m, d] = isoDate.split('-').map(Number)
  const utc = Date.UTC(y, m - 1, d) + days * 86_400_000
  return new Date(utc).toISOString().slice(0, 10)
}

/** [today, today + windowDays] inclusive, in Asia/Kolkata. */
export function dateWindow(isoDate, windowDays) {
  return Array.from({ length: windowDays + 1 }, (_, i) => addDays(isoDate, i))
}

/** Day name (Monday...) for an ISO date, in Asia/Kolkata. */
export function dayNameFor(isoDate) {
  const [y, m, d] = isoDate.split('-').map(Number)
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(y, m - 1, d)))
}

/** Numeric footfall multiplier -> low/medium/high enum for the Signals schema. */
export function impactLevel(multiplier) {
  if (multiplier >= 1.35) return 'high'
  if (multiplier >= 1.1) return 'medium'
  return 'low'
}

/** Safely parse JSON, returning null on failure. */
export function parseJson(text) {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}
