import { createHash } from 'node:crypto'
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
    const vendorData = vendorSnap.exists ? vendorSnap.data() : {}
    const bias = vendorData.biasFactors ?? {}
    const storedProfile = vendorData.profile ?? null

    return { history, bias, storedProfile }
  } catch (error) {
    return {
      history: [],
      bias: {},
      storedProfile: null,
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

export function normalizeWhatsappPhone(phone) {
  const digits = String(phone ?? '').replace(/\D/g, '')
  if (digits.length >= 10) return digits.slice(-10)
  return digits
}

/**
 * Lists vendors opted into morning WhatsApp delivery (T3.6). Degrades to [].
 */
export async function getWhatsappOptedInVendors({ db } = {}) {
  try {
    const database = db ?? getDb()
    const snap = await database
      .collection('vendors')
      .where('profile.whatsappOptIn', '==', true)
      .get()
    return snap.docs.map((doc) => ({
      vendorId: doc.id,
      profile: doc.data().profile ?? {},
    }))
  } catch (error) {
    console.warn('[store] getWhatsappOptedInVendors failed:', error?.message ?? error)
    return []
  }
}

/**
 * Finds a vendor by their configured WhatsApp number (T3.6 webhook handling).
 */
export async function findVendorByWhatsappPhone(phone, { db } = {}) {
  const target = normalizeWhatsappPhone(phone)
  if (!target) return null
  const optedIn = await getWhatsappOptedInVendors({ db })
  return (
    optedIn.find(
      (v) => normalizeWhatsappPhone(v.profile?.whatsappPhone) === target,
    ) ?? null
  )
}

const inMemoryGroupDemand = new Map()

export function clearInMemoryGroupDemand() {
  inMemoryGroupDemand.clear()
}

export function anonymizeVendorId(vendorId) {
  return createHash('sha256')
    .update(String(vendorId ?? ''))
    .digest('hex')
    .slice(0, 12)
}

function groupDocId(date, lane) {
  const slug = String(lane || 'hazratganj')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return `${date}_${slug || 'hazratganj'}`
}

export function aggregateGroupContributions(contributions = {}, selfHash = null) {
  const byItem = new Map()
  for (const [vHash, entry] of Object.entries(contributions)) {
    if (!entry?.optIn) continue
    for (const row of entry.items ?? []) {
      const itemName = String(row.item ?? '').trim().toLowerCase()
      const qty = Number(row.toBuy ?? row.quantity ?? 0)
      if (!itemName || !Number.isFinite(qty) || qty <= 0) continue
      const existing = byItem.get(itemName) ?? {
        item: itemName,
        unit: row.unit || 'units',
        vendorCount: 0,
        totalQuantity: 0,
        youJoined: false,
      }
      existing.vendorCount += 1
      existing.totalQuantity = Math.round((existing.totalQuantity + qty) * 100) / 100
      if (selfHash && vHash === selfHash) existing.youJoined = true
      byItem.set(itemName, existing)
    }
  }

  return [...byItem.values()].sort(
    (a, b) => b.vendorCount - a.vendorCount || b.totalQuantity - a.totalQuantity,
  )
}

/**
 * Records or withdraws anonymized procurement demand for same-lane group buying (T3.9).
 */
export async function recordGroupDemand(
  { vendorId, lane = 'Hazratganj', date, items = [], optIn = true },
  { db } = {},
) {
  if (!vendorId || !date) {
    return { saved: false, reason: 'missing vendorId or date' }
  }
  const key = groupDocId(date, lane)
  const vHash = anonymizeVendorId(vendorId)
  const entry = {
    optIn: Boolean(optIn),
    items: (items ?? []).map((i) => ({
      item: String(i.item ?? '').trim().toLowerCase(),
      toBuy: Number(i.toBuy ?? i.quantity ?? 0),
      unit: String(i.unit ?? 'units'),
    })),
    updatedAt: new Date().toISOString(),
  }

  // Always update in-memory mirror so local single-process mode stays consistent.
  const localMap = inMemoryGroupDemand.get(key) ?? {}
  if (optIn) {
    localMap[vHash] = entry
  } else {
    delete localMap[vHash]
  }
  inMemoryGroupDemand.set(key, localMap)

  if (db === null) {
    return { saved: true, key, source: 'memory' }
  }

  try {
    const database = db ?? getDb()
    const docRef = database.collection('groupDemand').doc(key)
    const work = async () => {
      const snap = await docRef.get()
      const current = snap.exists ? (snap.data()?.contributions ?? {}) : {}
      if (optIn) {
        current[vHash] = entry
      } else {
        delete current[vHash]
      }
      await docRef.set(
        { lane, date, contributions: current, updatedAt: new Date().toISOString() },
        { merge: true },
      )
    }
    await Promise.race([
      work(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Firestore group-buying write timeout')), 1500),
      ),
    ])
    return { saved: true, key, source: 'firestore' }
  } catch (error) {
    return { saved: true, key, source: 'memory', fallbackReason: error?.message }
  }
}

/**
 * Returns anonymized aggregated item demand across nearby vendors in the lane (T3.9).
 */
export async function getGroupDemand(
  { lane = 'Hazratganj', date, vendorId = null },
  { db } = {},
) {
  const key = groupDocId(date, lane)
  const selfHash = vendorId ? anonymizeVendorId(vendorId) : null

  let contributions = inMemoryGroupDemand.get(key) ?? {}
  let source = 'memory'
  if (db !== null) {
    try {
      const database = db ?? getDb()
      const snap = await Promise.race([
        database.collection('groupDemand').doc(key).get(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Firestore group-buying read timeout')), 1500),
        ),
      ])
      if (snap.exists && snap.data()?.contributions) {
        contributions = snap.data().contributions
        source = 'firestore'
      }
    } catch {
      // Graceful fallback to local memory store when Firestore is unconfigured.
    }
  }

  const optedInVendors = Object.values(contributions).filter((c) => c?.optIn).length
  const suggestions = aggregateGroupContributions(contributions, selfHash)

  return {
    lane,
    date,
    optedInVendors,
    youOptedIn: Boolean(selfHash && contributions[selfHash]?.optIn),
    suggestions,
    source,
    isMock: false,
  }
}
