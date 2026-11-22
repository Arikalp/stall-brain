import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Minimal HS256 JWT sign/verify built on node:crypto.
 *
 * Google OAuth gives us a verified identity; this module mints our own
 * stateless session tokens so the frontend can send `Authorization: Bearer`
 * exactly like it did with Firebase ID tokens (and so SSE requests that build
 * their own fetch keep working).
 */

function base64UrlEncode(buffer) {
  return Buffer.from(buffer).toString('base64url')
}

function sign(data, secret) {
  return createHmac('sha256', secret).update(data).digest('base64url')
}

/**
 * Signs a session token. Claims:
 *   sub     - stable vendor id (Google account `sub`)
 *   email   - Google account email (display + uniqueness checks)
 *   name    - display name
 *   picture - avatar URL
 *   iss     - 'bazaar-brain'
 *   iat     - issued-at (seconds)
 *   exp     - expiry (seconds)
 */
export function signSessionToken(payload, { secret, ttlSeconds }) {
  const now = Math.floor(Date.now() / 1000)
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = base64UrlEncode(
    JSON.stringify({
      iss: 'bazaar-brain',
      iat: now,
      exp: now + ttlSeconds,
      ...payload,
    }),
  )
  const data = `${header}.${body}`
  return `${data}.${sign(data, secret)}`
}

/**
 * Verifies signature + expiry + issuer. Returns the decoded payload or null.
 * Never throws - callers treat null as an invalid token.
 */
export function verifySessionToken(token, secret) {
  if (typeof token !== 'string') return null

  const parts = token.split('.')
  if (parts.length !== 3) return null

  const [header, body, signature] = parts
  const expected = sign(`${header}.${body}`, secret)
  const given = Buffer.from(signature)
  const wanted = Buffer.from(expected)
  if (given.length !== wanted.length || !timingSafeEqual(given, wanted)) {
    return null
  }

  let payload
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
  } catch {
    return null
  }

  if (payload.iss !== 'bazaar-brain') return null
  if (typeof payload.exp !== 'number' || payload.exp <= Date.now() / 1000) {
    return null
  }
  if (typeof payload.sub !== 'string' || payload.sub.length === 0) return null

  return payload
}
