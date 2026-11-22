export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { createHmac, randomBytes } from 'node:crypto'
import { config } from '@/lib/server/config'

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'

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
  if (!oauthConfigured()) {
    return NextResponse.json(
      {
        error: 'AUTH_NOT_CONFIGURED',
        message: 'Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and SESSION_SECRET to enable Google sign-in.',
      },
      { status: 503 }
    )
  }

  const payload = Buffer.from(
    JSON.stringify({ t: Date.now(), n: randomBytes(8).toString('hex') }),
  ).toString('base64url')
  const state = `${payload}.${signState(payload)}`

  const params = new URLSearchParams({
    client_id: config.googleClientId,
    redirect_uri: resolveRedirectUri(request),
    response_type: 'code',
    scope: 'openid email profile',
    prompt: 'select_account',
    include_granted_scopes: 'true',
    state,
  })

  return NextResponse.redirect(`${GOOGLE_AUTH_URL}?${params.toString()}`)
}
