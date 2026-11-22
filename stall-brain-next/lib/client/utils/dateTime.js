const TIMEZONE = 'Asia/Kolkata'

export function getTodayInfo() {
  const now = new Date()
  const dateString = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
  const dayName = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    weekday: 'long',
  }).format(now)
  const dateLabel = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(now)

  return { dateString, dayName, dateLabel }
}

export { TIMEZONE }
