import { getSessionToken } from './auth'

// Base URL of API routes (empty string for same-origin Next.js API routes).
export const API_BASE = (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_API_URL) ? process.env.NEXT_PUBLIC_API_URL : ''

function makeError(code) {
  const error = new Error(code)
  error.code = code
  return error
}

/**
 * Session token for the signed-in vendor. Exported for streaming requests
 * that build their own fetch (SSE via ReadableStream; EventSource cannot send
 * auth headers). Still no secrets here - only the vendor's own token.
 */
export function getAccessToken() {
  const token = getSessionToken()
  if (!token) {
    throw makeError('AUTH_REQUIRED')
  }
  return token
}

/**
 * Authenticated request to the Bazaar Brain backend.
 * Sends the caller's session token; the backend verifies it and responds
 * with `{ error: CODE }` bodies that are surfaced as Error.code.
 */
export async function apiRequest(path, { method = 'GET', body, signal } = {}) {
  const token = getAccessToken()

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
