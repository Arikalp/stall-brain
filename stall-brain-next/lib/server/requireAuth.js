import { verifySessionToken } from './lib/sessionToken.js'
import { config } from './config.js'

/**
 * Extracts and verifies the Bearer token from a Next.js Request.
 * Returns { vendorId, auth, error: null } or { vendorId: null, auth: null, error: message, status: 401 }.
 * Pure HS256 + demo verification with zero external network dependencies (0ms latency).
 */
export async function requireAuth(request) {
  const header = request.headers.get('authorization') ?? ''
  const [scheme, token] = header.split(' ')

  if (scheme !== 'Bearer' || !token) {
    return {
      vendorId: null,
      auth: null,
      error: 'Missing or malformed Authorization header.',
      status: 401,
    }
  }

  // 1. Demo user bypass: instant preview without external OAuth
  if (token === 'demo-vendor-token' || token.startsWith('demo-')) {
    return {
      vendorId: 'demo-vendor-hazratganj',
      auth: {
        sub: 'demo-vendor-hazratganj',
        email: 'demo@bazaarbrain.in',
        name: 'Ramesh Kumar (Demo Vendor)',
        picture: '/logo-icon.png',
      },
      error: null,
    }
  }

  // 2. HS256 session token minted by /api/auth/google/callback or /api/auth/demo
  const secrets = [
    config.sessionSecret,
    'stall_brain_secure_jwt_session_secret_2026_lucknow',
    'default_demo_session_secret_for_stall_brain',
  ].filter(Boolean)

  for (const secret of secrets) {
    const session = verifySessionToken(token, secret)
    if (session) {
      return {
        vendorId: session.sub,
        auth: session,
        error: null,
      }
    }
  }

  return {
    vendorId: null,
    auth: null,
    error: 'Invalid or expired token.',
    status: 401,
  }
}
