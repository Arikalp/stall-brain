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
