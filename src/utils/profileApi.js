import { apiRequest } from './api'

/**
 * Server-side vendor data persistence (T2.2). localStorage remains a fast
 * cache, but the source of truth lives in Firestore under vendors/{uid} —
 * so clearing the browser loses nothing.
 */

/** @returns {Promise<profile|null>} the stored profile, or null for a new vendor */
export async function fetchServerProfile() {
  const result = await apiRequest('/api/profile')
  return result?.profile ?? null
}

/**
 * @param {{stallType: string, stallLabel: string, stallEmoji: string, ingredients: string[]}} profile
 * @returns {Promise<{saved: boolean, profile: object}>}
 */
export async function pushServerProfile(profile) {
  return apiRequest('/api/profile', {
    method: 'PUT',
    body: profile,
  })
}

/**
 * @param {number} [limit] recent saved forecast runs, newest first (default 5)
 * @returns {Promise<Array<{runId: string, date: string, approvedPlan: object, ...}>>}
 */
export async function fetchRecentRuns(limit) {
  const result = await apiRequest(`/api/runs${limit ? `?limit=${limit}` : ''}`)
  return Array.isArray(result?.runs) ? result.runs : []
}
