import { Router } from 'express'
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { config } from '../config.js'
import { signSessionToken } from '../lib/sessionToken.js'
import { requireAuth } from '../middleware/auth.js'

export const authRouter = Router()

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo'
// CSRF state tokens are valid for 10 minutes.
const STATE_TTL_MS = 10 * 60 * 1000

/**
 * Real Google OAuth, restored.
 *
 *   GET /api/auth/google/start     -> redirect to Google's consent screen
 *   GET /api/auth/google/callback  -> exchange code, mint our HS256 session
 *                                     token, redirect to the SPA
 *   GET /api/auth/demo             -> shared demo-vendor session (fallback)
 *   GET /api/auth/me               -> introspection for the SPA
 *   POST /api/auth/logout          -> stateless; client discards the token
 */

function oauthConfigured() {
  return Boolean(config.googleClientId && config.googleClientSecret && config.sessionSecret)
}

function signState(payloadB64) {
  return createHmac('sha256', config.sessionSecret).update(payloadB64).digest('base64url')
}

/** Derives the callback URI: explicit override, else from the request host. */
function resolveRedirectUri(req) {
  if (config.googleRedirectUri) return config.googleRedirectUri
  // trust proxy is enabled, so req.protocol reflects X-Forwarded-Proto.
  return `${req.protocol}://${req.get('host')}/api/auth/google/callback`
}

authRouter.get('/auth/google/start', (req, res) => {
  if (!oauthConfigured()) {
    return res.status(503).json({
      error: 'AUTH_NOT_CONFIGURED',
      message:
        'Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and SESSION_SECRET in backend/.env to enable Google sign-in.',
    })
  }

  // Signed, timestamped state (CSRF protection). The callback verifies the
  // HMAC and rejects states older than STATE_TTL_MS.
  const payload = Buffer.from(
    JSON.stringify({ t: Date.now(), n: randomBytes(8).toString('hex') }),
  ).toString('base64url')
  const state = `${payload}.${signState(payload)}`

  const params = new URLSearchParams({
    client_id: config.googleClientId,
    redirect_uri: resolveRedirectUri(req),
    response_type: 'code',
    scope: 'openid email profile',
    prompt: 'select_account',
    include_granted_scopes: 'true',
    state,
  })

  return res.redirect(`${GOOGLE_AUTH_URL}?${params.toString()}`)
})

authRouter.get('/auth/google/callback', async (req, res) => {
  const frontend = config.frontendUrl || 'http://localhost:5173'
  const back = (fragment) => res.redirect(`${frontend}/auth/callback#${fragment}`)
  const fail = (code) => back(`error=${encodeURIComponent(code)}`)

  if (!oauthConfigured()) return fail('AUTH_NOT_CONFIGURED')

  const code = typeof req.query.code === 'string' ? req.query.code : ''
  const state = typeof req.query.state === 'string' ? req.query.state : ''
  if (!code || !state) return fail('OAUTH_MISSING_PARAMS')

  // Verify state: HMAC must match and the state must be fresh.
  const dot = state.lastIndexOf('.')
  if (dot <= 0) return fail('OAUTH_BAD_STATE')
  const payloadB64 = state.slice(0, dot)
  const signature = Buffer.from(state.slice(dot + 1))
  const expected = Buffer.from(signState(payloadB64))
  if (signature.length !== expected.length || !timingSafeEqual(signature, expected)) {
    return fail('OAUTH_BAD_STATE')
  }

  let issued
  try {
    issued = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'))
  } catch {
    return fail('OAUTH_BAD_STATE')
  }
  if (typeof issued?.t !== 'number' || Date.now() - issued.t > STATE_TTL_MS) {
    return fail('OAUTH_STATE_EXPIRED')
  }

  // Exchange the authorization code for tokens.
  let tokenJson
  try {
    const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: config.googleClientId,
        client_secret: config.googleClientSecret,
        redirect_uri: resolveRedirectUri(req),
        grant_type: 'authorization_code',
      }),
    })
    tokenJson = await tokenRes.json().catch(() => null)
    if (!tokenRes.ok || !tokenJson?.access_token) {
      console.warn('[auth] Token exchange failed:', tokenJson?.error ?? tokenRes.status)
      return fail('OAUTH_TOKEN_EXCHANGE_FAILED')
    }
  } catch (error) {
    console.error('[auth] Token exchange error:', error?.message)
    return fail('OAUTH_TOKEN_EXCHANGE_FAILED')
  }

  // Fetch the verified identity from Google's OIDC userinfo endpoint.
  let profile
  try {
    const userRes = await fetch(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${tokenJson.access_token}` },
    })
    profile = await userRes.json().catch(() => null)
    if (!userRes.ok || !profile?.sub) {
      console.warn('[auth] Userinfo fetch failed:', userRes.status)
      return fail('OAUTH_PROFILE_FAILED')
    }
  } catch (error) {
    console.error('[auth] Userinfo error:', error?.message)
    return fail('OAUTH_PROFILE_FAILED')
  }

  if (!config.sessionSecret) return fail('AUTH_NOT_CONFIGURED')

  const token = signSessionToken(
    {
      sub: profile.sub,
      email: profile.email ?? '',
      name: profile.name ?? '',
      picture: profile.picture ?? '',
    },
    { secret: config.sessionSecret, ttlSeconds: config.sessionTtlSeconds },
  )

  // Token travels in the URL fragment (#...) so it never hits server logs
  // or referrer headers.
  return back(`token=${encodeURIComponent(token)}`)
})

/**
 * Demo sign-in (fallback when Google OAuth is not configured).
 *
 * Signs the visitor in as a shared demo vendor with a real HS256 session
 * token so requireAuth-protected routes and the frontend's
 * `Authorization: Bearer` flow work unchanged.
 */
const DEMO_VENDOR = {
  sub: 'demo-vendor',
  email: 'demo@bazaarbrain.app',
  name: 'Demo Vendor',
  picture: '',
}

authRouter.get('/auth/demo', (_req, res) => {
  if (!config.sessionSecret) {
    return res.status(503).json({
      error: 'AUTH_NOT_CONFIGURED',
      message: 'Set SESSION_SECRET in backend/.env to issue demo sessions.',
    })
  }

  const token = signSessionToken(DEMO_VENDOR, {
    secret: config.sessionSecret,
    ttlSeconds: config.sessionTtlSeconds,
  })

  return res.json({
    token,
    user: {
      vendorId: DEMO_VENDOR.sub,
      email: DEMO_VENDOR.email,
      name: DEMO_VENDOR.name,
      picture: DEMO_VENDOR.picture,
    },
  })
})

/**
 * Lightweight session introspection for the SPA (validates the token and
 * returns the identity so stale localStorage can be cleaned up).
 */
authRouter.get('/auth/me', requireAuth, (req, res) => {
  return res.json({
    vendorId: req.vendorId,
    email: req.auth?.email ?? '',
    name: req.auth?.name ?? '',
    picture: req.auth?.picture ?? '',
  })
})

authRouter.post('/auth/logout', requireAuth, (_req, res) => {
  // Sessions are stateless; the client discards its token.
  return res.json({ ok: true })
})
