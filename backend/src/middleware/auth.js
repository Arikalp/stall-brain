import path from 'node:path'
import { existsSync, readFileSync } from 'node:fs'
import admin from 'firebase-admin'
import { getAuth } from 'firebase-admin/auth'
import { config } from '../config.js'

let adminApp

function loadServiceAccount() {
  if (config.firebaseServiceAccountJson) {
    return JSON.parse(config.firebaseServiceAccountJson)
  }
  if (config.firebaseServiceAccountPath) {
    const filePath = path.resolve(config.firebaseServiceAccountPath)
    if (!existsSync(filePath)) {
      throw new Error(`[auth] Service account file not found: ${filePath}`)
    }
    return JSON.parse(readFileSync(filePath, 'utf8'))
  }
  return null
}

/**
 * Initializes firebase-admin exactly once.
 *
 * Preferred: a service account (FIREBASE_SERVICE_ACCOUNT_JSON or
 * FIREBASE_SERVICE_ACCOUNT_PATH) - full admin capabilities.
 *
 * Verification-only fallback: with just FIREBASE_PROJECT_ID (or ADC), ID tokens
 * are still fully verified (signature + audience + expiry) against Google's
 * public keys. Admin APIs that mint tokens (custom tokens, session cookies)
 * are unavailable in this mode, which is fine for this API.
 */
export function initFirebaseAdmin() {
  if (adminApp) return adminApp

  const serviceAccount = loadServiceAccount()
  const options = {}

  if (serviceAccount) {
    if (!serviceAccount.project_id) {
      throw new Error(
        '[auth] Service account JSON is missing "project_id". Export a key for the bazaar-brain project.',
      )
    }
    options.credential = admin.credential.cert(serviceAccount)
    options.projectId = config.firebaseProjectId || serviceAccount.project_id
  } else {
    options.credential = admin.credential.applicationDefault()
    if (config.firebaseProjectId) {
      options.projectId = config.firebaseProjectId
    }
  }

  if (!options.projectId) {
    throw new Error(
      '[auth] Missing Firebase project id. Set FIREBASE_PROJECT_ID (or provide a service account) in backend/.env.',
    )
  }

  adminApp = admin.initializeApp(options)
  return adminApp
}

export function getFirebaseAuth() {
  if (!adminApp) {
    initFirebaseAdmin()
  }
  return getAuth(adminApp)
}

function respondUnauthorized(res, message) {
  return res
    .status(401)
    .json({ error: 'AUTH_REQUIRED', message })
}

/**
 * Verifies the Firebase ID token on every request and exposes the uid as
 * req.vendorId. Requests without a valid Bearer token get 401.
 */
export async function requireAuth(req, res, next) {
  const header = req.headers.authorization ?? ''
  const [scheme, token] = header.split(' ')

  if (scheme !== 'Bearer' || !token) {
    return respondUnauthorized(res, 'Missing or malformed Authorization header.')
  }

  try {
    // checkRevoked = true rejects tokens invalidated by a sign-out or password change.
    const decodedToken = await getFirebaseAuth().verifyIdToken(token, true)
    req.vendorId = decodedToken.uid
    return next()
  } catch (error) {
    console.warn('[auth] Token verification failed:', error?.code ?? error?.message)
    return respondUnauthorized(res, 'Invalid or expired token.')
  }
}
