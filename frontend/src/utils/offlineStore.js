import { submitDailyLog } from './logsApi'

const LAST_FORECAST_KEY = 'bazaarBrain_lastForecast'
const OFFLINE_LOG_QUEUE_KEY = 'bazaarBrain_pendingLogs'

export function saveLastForecast(forecast, meta = {}) {
  if (typeof window === 'undefined' || !forecast) return
  try {
    localStorage.setItem(
      LAST_FORECAST_KEY,
      JSON.stringify({
        forecast,
        meta,
        cachedAt: new Date().toISOString(),
      }),
    )
  } catch {
    // Storage quota full — ignore gracefully.
  }
}

export function loadLastForecast() {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(LAST_FORECAST_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed?.forecast) return null
    return parsed
  } catch {
    return null
  }
}

export function getQueuedOfflineLogs() {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(OFFLINE_LOG_QUEUE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function enqueueOfflineLog(logPayload) {
  if (typeof window === 'undefined' || !logPayload?.date) return []
  const current = getQueuedOfflineLogs().filter(
    (entry) => entry.date !== logPayload.date,
  )
  const next = [...current, { ...logPayload, queuedAt: new Date().toISOString() }]
  localStorage.setItem(OFFLINE_LOG_QUEUE_KEY, JSON.stringify(next))
  return next
}

export async function flushOfflineLogQueue(submitFn = submitDailyLog) {
  const queued = getQueuedOfflineLogs()
  if (!queued.length) return { synced: 0, remaining: 0 }

  const remaining = []
  let synced = 0

  for (const entry of queued) {
    const { queuedAt: _ignored, ...payload } = entry
    try {
      await submitFn(payload)
      synced += 1
    } catch {
      remaining.push(entry)
    }
  }

  localStorage.setItem(OFFLINE_LOG_QUEUE_KEY, JSON.stringify(remaining))
  return { synced, remaining: remaining.length }
}

