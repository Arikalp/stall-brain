export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { config } from '@/lib/server/config'
import { signSessionToken } from '@/lib/server/lib/sessionToken'

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo'
const STATE_TTL_MS = 10 * 60 * 1000

function oauthConfigured() {
  return Boolean(config.googleClientId && config.googleClientSecret && config.sessionSecret)
}

function signState(payloadB64) {
  return createHmac('sha256', config.sessionSecret).update(payloadB64).digest('base64url')
}

function resolveRedirectUri(request) {
  if (config.googleRedirectUri) return config.googleRedirectUri
  const host = request.headers.get('host') || 'localhost:3000'
  const protocol = request.headers.get('x-forwarded-proto') || 'http'
  return `${protocol}://${host}/api/auth/google/callback`
}

export async function GET(request) {
  const url = new URL(request.url)
  const host = request.headers.get('host') || 'localhost:3000'
  const protocol = request.headers.get('x-forwarded-proto') || 'http'
  const frontendBase = config.frontendUrl || `${protocol}://${host}`

  const back = (fragment) => NextResponse.redirect(`${frontendBase}/auth/callback#${fragment}`)
  const fail = (code) => back(`error=${encodeURIComponent(code)}`)

  if (!oauthConfigured()) return fail('AUTH_NOT_CONFIGURED')

  const code = url.searchParams.get('code') ?? ''
  const state = url.searchParams.get('state') ?? ''
  if (!code || !state) return fail('OAUTH_MISSING_PARAMS')

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

  let tokenJson
  try {
    const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: config.googleClientId,
        client_secret: config.googleClientSecret,
        redirect_uri: resolveRedirectUri(request),
        grant_type: 'authorization_code',
      }),
    })
    tokenJson = await tokenRes.json().catch(() => null)
    if (!tokenRes.ok || !tokenJson?.access_token) {
      return fail('OAUTH_TOKEN_EXCHANGE_FAILED')
    }
  } catch {
    return fail('OAUTH_TOKEN_EXCHANGE_FAILED')
  }

  let profile
  try {
    const userRes = await fetch(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${tokenJson.access_token}` },
    })
    profile = await userRes.json().catch(() => null)
    if (!userRes.ok || !profile?.sub) {
      return fail('OAUTH_PROFILE_FAILED')
    }
  } catch {
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

  return back(`token=${encodeURIComponent(token)}`)
}
