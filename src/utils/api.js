import { auth } from './firebase'

// Base URL of the Express backend (no secrets here - the browser only ever
// sends its own Firebase ID token).
export const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001'

function makeError(code) {
  const error = new Error(code)
  error.code = code
  return error
}

/**
 * Firebase ID token for the signed-in vendor. Exported for streaming requests
 * that build their own fetch (SSE via ReadableStream; EventSource cannot send
 * auth headers). Still no secrets here - only the vendor's own token.
 */
export async function getAccessToken() {
  const user = auth.currentUser
  if (!user) {
    throw makeError('AUTH_REQUIRED')
  }
  return user.getIdToken()
}

/**
 * Authenticated request to the Bazaar Brain backend.
 * Sends the caller's Firebase ID token; the backend verifies it and responds
 * with `{ error: CODE }` bodies that are surfaced as Error.code.
 */
export async function apiRequest(path, { method = 'GET', body, signal } = {}) {
  const token = await getAccessToken()

  let response
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    })
  } catch {
    throw makeError('NETWORK_ERROR')
  }

  let payload = null
  try {
    payload = await response.json()
  } catch {
    // Non-JSON or empty body - leave payload as null.
  }

  if (!response.ok) {
    if (response.status === 401) {
      throw makeError('AUTH_REQUIRED')
    }
    if (response.status === 429) {
      throw makeError('RATE_LIMITED')
    }
    throw makeError(payload?.error ?? 'REQUEST_FAILED')
  }

  return payload
}
