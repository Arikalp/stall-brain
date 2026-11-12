import { apiRequest } from './api'

/**
 * End-of-day sales log client (T2.1). The log is persisted server-side at
 * vendors/{uid}/logs/{date}; it is the feedback loop's data source for bias
 * correction (T2.3).
 */

/**
 * @param {{date: string, items: Array<{item: string, outcome: string, leftoverLevel?: string}>, customers?: number}} log
 * @returns {Promise<{saved: boolean, date: string, biasUpdated: string[], biasExplanations: string[]}>}
 */
export async function submitDailyLog(log) {
  return apiRequest('/api/logs', {
    method: 'POST',
    body: log,
  })
}

/**
 * @param {number} [limit] recent logs, newest first (default 14, max 30)
 * @returns {Promise<Array<{date: string, items: Array<object>, customers?: number}>>}
 */
export async function fetchRecentLogs(limit) {
  const result = await apiRequest(`/api/logs${limit ? `?limit=${limit}` : ''}`)
  return Array.isArray(result?.logs) ? result.logs : []
}
