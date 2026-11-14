// Client-side session management for the shared demo vendor.
//
// Google OAuth was removed: the backend mints an HS256 session token for a
// fixed demo vendor (GET /api/auth/demo), we keep it in localStorage and send
// it as `Authorization: Bearer` on every API call, exactly like before.

import { API_BASE } from './api'

const SESSION_KEY = 'bb_session'

function makeError(code) {
  const error = new Error(code)
  error.code = code
  return error
}

function decodeJwtPayload(token) {
  try {
    const [, payload] = token.split('.')
    return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')))
  } catch {
    return null
  }
}

function persist(token, payload) {
  const record = {
    token,
    user: {
      vendorId: payload.sub,
      email: payload.email ?? '',
      name: payload.name ?? '',
      picture: payload.picture ?? '',
    },
    exp: payload.exp,
  }
  localStorage.setItem(SESSION_KEY, JSON.stringify(record))
  window.dispatchEvent(new CustomEvent('bb-auth-changed', { detail: record.user }))
}

/**
 * Returns `{ token, user, exp }` when a valid (non-expired) session exists,
 * otherwise null (clearing any stale copy).
 */
export function getSession() {
  let record = null
  try {
    record = JSON.parse(localStorage.getItem(SESSION_KEY))
  } catch {
    record = null
  }
  if (!record?.token) return null
  if (typeof record.exp !== 'number' || record.exp <= Date.now() / 1000) {
    clearSession()
    return null
  }
  return record
}

export function isAuthenticated() {
  return Boolean(getSession())
}

export function getStoredUser() {
  return getSession()?.user ?? null
}

export function getSessionToken() {
  return getSession()?.token ?? null
}

/** Stores a session token issued by the backend. */
export function setSession(token) {
  if (!token) throw makeError('AUTH_NO_TOKEN')
  const payload = decodeJwtPayload(token)
  if (!payload?.sub || !payload?.exp) throw makeError('AUTH_BAD_TOKEN')
  persist(token, payload)
}

export function clearSession() {
  const had = localStorage.getItem(SESSION_KEY)
  localStorage.removeItem(SESSION_KEY)
  if (had) {
    window.dispatchEvent(new CustomEvent('bb-auth-changed', { detail: null }))
  }
}

/**
 * Signs the visitor in as the shared demo vendor: fetches a session token
 * from the backend and persists it. Returns the demo user, or throws.
 * (Fallback for when Google OAuth isn't configured.)
 */
export async function startDemoAuth() {
  let response
  try {
    response = await fetch(`${API_BASE}/api/auth/demo`)
  } catch {
    throw makeError('NETWORK_ERROR')
  }

  if (!response.ok) {
    throw makeError('AUTH_DEMO_FAILED')
  }

  const payload = await response.json().catch(() => null)
  if (!payload?.token) {
    throw makeError('AUTH_NO_TOKEN')
  }

  setSession(payload.token)
  return payload.user ?? null
}

/**
 * Kicks off real Google OAuth: the browser navigates to the backend's
 * /api/auth/google/start, which redirects to Google's consent screen.
 * Google then returns the user to <FRONTEND_URL>/auth/callback.
 */
export function startGoogleAuth() {
  window.location.href = `${API_BASE}/api/auth/google/start`
}

/**
 * Reads the result of the OAuth flow from the callback URL. The backend
 * redirects to /auth/callback#token=... on success or #error=CODE on
 * failure. Clears the fragment either way and returns { token, error }.
 */
export function consumeOAuthResult() {
  const read = (raw) => {
    if (!raw || raw.length < 2) return new URLSearchParams()
    return new URLSearchParams(raw.substring(1))
  }
  // Token lives in the fragment (#...); error codes may arrive in either
  // the fragment or the query string.
  const params = read(window.location.hash)
  if (!params.get('token') && !params.get('error')) {
    const query = read(window.location.search)
    for (const [key, value] of query) params.set(key, value)
  }

  // Strip the fragment and query so refreshing the page doesn't replay it.
  window.history.replaceState(null, '', window.location.pathname)

  return {
    token: params.get('token'),
    error: params.get('error'),
  }
}
