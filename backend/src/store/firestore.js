import { getFirestore } from 'firebase-admin/firestore'
import { initFirebaseAdmin } from '../middleware/auth.js'

/**
 * Firestore access for vendor data (T1.9/T2.2):
 *   vendors/{vendorId}                      -> profile, biasFactors
 *   vendors/{vendorId}/logs/{date}          -> DailyLog (end-of-day outcomes)
 *   vendors/{vendorId}/runs/{runId}         -> saved forecast runs
 *
 * All reads/writes degrade gracefully: a Firestore outage must never crash a
 * forecast run; the graph continues with empty history/bias.
 */

let cachedDb

export function getDb() {
  if (!cachedDb) {
    initFirebaseAdmin()
    cachedDb = getFirestore()
  }
  return cachedDb
}

/** For tests: inject an adapter or reset the cache. */
export function setDb(db) {
  cachedDb = db
}

export const MAX_HISTORY_LOGS = 30

/**
 * Reads the vendor's last 14-30 daily logs and learned bias factors.
 * Returns { history, bias, error? } - never throws.
 */
export async function getVendorContext(vendorId, { db } = {}) {
  if (!vendorId) {
    return { history: [], bias: {} }
  }

  try {
    // Inside try: an unavailable/ unconfigured Firestore must degrade to
    // empty context, never crash the run.
    const database = db ?? getDb()
    const [logsSnap, vendorSnap] = await Promise.all([
      database
        .collection('vendors')
        .doc(vendorId)
        .collection('logs')
        .orderBy('date', 'desc')
        .limit(MAX_HISTORY_LOGS)
        .get(),
      database.collection('vendors').doc(vendorId).get(),
    ])

    const history = logsSnap.docs.map((doc) => ({ date: doc.id, ...doc.data() }))
    const bias = vendorSnap.exists ? (vendorSnap.data().biasFactors ?? {}) : {}

    return { history, bias }
  } catch (error) {
    return {
      history: [],
      bias: {},
      error: `Firestore vendor context unavailable: ${error?.message ?? error}`,
    }
  }
}

/**
 * Persists an approved run (and its edits - the learning signal for T2.3).
 * Returns { saved: boolean, reason? } - never throws.
 */
export async function saveRun(vendorId, run, { db } = {}) {
  if (!vendorId || !run?.runId) {
    return { saved: false, reason: 'missing vendorId or runId' }
  }

  try {
    const database = db ?? getDb()
    await database
      .collection('vendors')
      .doc(vendorId)
      .collection('runs')
      .doc(run.runId)
      .set({
        date: run.date ?? null,
        stallType: run.stallType ?? null,
        stallLabel: run.stallLabel ?? null,
        plan: run.plan ?? null,
        approvedPlan: run.approvedPlan ?? null,
        edits: run.edits ?? [],
        signals: {
          weather: run.signals?.weather ?? null,
          events: run.signals?.events ?? [],
          festivals: run.signals?.festivals ?? [],
          match: run.signals?.match ?? null,
          errors: run.signals?.errors ?? [],
        },
        multiplier: run.multiplier ?? null,
        createdAt: new Date().toISOString(),
      })
    return { saved: true }
  } catch (error) {
    return { saved: false, reason: `Firestore save failed: ${error?.message ?? error}` }
  }
}

/**
 * Upserts the vendor's end-of-day log for a date (T2.1/T2.2):
 *   vendors/{vendorId}/logs/{date}
 * Returning { saved: false } (HTTP 503) instead of throwing, so the vendor can
 * retry rather than silently lose their log.
 */
export async function saveDailyLog(vendorId, log, { db } = {}) {
  if (!vendorId || !log?.date) {
    return { saved: false, reason: 'missing vendorId or date' }
  }

  try {
    const database = db ?? getDb()
    await database
      .collection('vendors')
      .doc(vendorId)
      .collection('logs')
      .doc(log.date)
      .set({
        vendorId,
        date: log.date,
        items: log.items ?? [],
        customers: log.customers ?? null,
        createdAt: new Date().toISOString(),
      })
    return { saved: true }
  } catch (error) {
    return { saved: false, reason: `Firestore save failed: ${error?.message ?? error}` }
  }
}

/**
 * The vendor's most recent daily logs, newest first. Degrades to [] when
 * Firestore is unavailable - the UI still works, just without history.
 */
export async function getRecentLogs(vendorId, limit = MAX_HISTORY_LOGS, { db } = {}) {
  if (!vendorId) return []

  try {
    const database = db ?? getDb()
    const snap = await database
      .collection('vendors')
      .doc(vendorId)
      .collection('logs')
      .orderBy('date', 'desc')
      .limit(Math.min(Math.max(1, limit), MAX_HISTORY_LOGS))
      .get()
    return snap.docs.map((doc) => ({ date: doc.id, ...doc.data() }))
  } catch (error) {
    console.warn('[store] getRecentLogs failed:', error?.message ?? error)
    return []
  }
}

/**
 * Vendor profile (T2.2): vendors/{vendorId}.profile. Never throws - a failed
 * read returns null and the vendor re-saves; nothing is lost.
 */
export async function getVendorProfile(vendorId, { db } = {}) {
  if (!vendorId) return { profile: null }

  try {
    const database = db ?? getDb()
    const snap = await database.collection('vendors').doc(vendorId).get()
    const profile = snap.exists ? (snap.data().profile ?? null) : null
    return { profile }
  } catch (error) {
    return {
      profile: null,
      error: `Firestore profile unavailable: ${error?.message ?? error}`,
    }
  }
}

export async function saveVendorProfile(vendorId, profile, { db } = {}) {
  if (!vendorId || !profile?.stallType) {
    return { saved: false, reason: 'missing vendorId or profile' }
  }

  try {
    // merge: keeps biasFactors and any other doc fields intact.
    const database = db ?? getDb()
    await database
      .collection('vendors')
      .doc(vendorId)
      .set({ profile, updatedAt: new Date().toISOString() }, { merge: true })
    return { saved: true }
  } catch (error) {
    return { saved: false, reason: `Firestore save failed: ${error?.message ?? error}` }
  }
}

/**
 * The vendor's recent saved forecast runs (T2.2): server-side forecast
 * history, so it survives a cleared browser. Degrades to [].
 */
export async function getRecentRuns(vendorId, limit = 5, { db } = {}) {
  if (!vendorId) return []

  try {
    const database = db ?? getDb()
    const snap = await database
      .collection('vendors')
      .doc(vendorId)
      .collection('runs')
      .orderBy('createdAt', 'desc')
      .limit(Math.min(Math.max(1, limit), MAX_HISTORY_LOGS))
      .get()
    return snap.docs.map((doc) => ({ runId: doc.id, ...doc.data() }))
  } catch (error) {
    console.warn('[store] getRecentRuns failed:', error?.message ?? error)
    return []
  }
}
