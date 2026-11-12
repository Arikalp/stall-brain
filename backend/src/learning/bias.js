/**
 * Bias correction engine (T2.3): keeps per-item demand factors that bring
 * the forecast closer to reality over time.
 *
 * Data model (in Firestore at vendors/{vendorId}.biasFactors):
 *   {
 *     [itemName]: {
 *       factor: number,         // overall EMA factor (applied in forecast.js)
 *       weekday: {              // per-weekday override (optional refinement)
 *         [0-6]: number,        // 0 = Sunday … 6 = Saturday
 *       },
 *       updatedAt: string,      // ISO timestamp of last update
 *     }
 *   }
 *
 * The forecast node reads `bias[item]` as a plain number.  When a weekday
 * factor exists it takes precedence; otherwise the overall factor is used.
 * loadContext.js already stores `bias` on state; forecast.js already multiplies
 * it in; this file only manages the UPDATES.
 *
 * EMA update:
 *   new_factor = clamp(EMA_ALPHA * observed_ratio + (1 - EMA_ALPHA) * old_factor)
 *
 *   observed_ratio encodes the vendor outcome:
 *     sold_out            → 1.20  (we under-bought; buy 20% more next time)
 *     just_right          → 1.00  (perfect; no change)
 *     leftover_small      → 0.90
 *     leftover_medium     → 0.80
 *     leftover_large      → 0.70
 *     wasted              → 0.65
 *
 *   Vendor edits from the approval step (T1.8) are treated as a milder
 *   signal (EMA_ALPHA_EDIT instead of EMA_ALPHA).
 *
 * Clamping: 0.5 ≤ factor ≤ 1.8 so a noisy day cannot blow up the model.
 */

import { getDb } from '../store/firestore.js'

// ── constants ──────────────────────────────────────────────────────────────

export const EMA_ALPHA = 0.25          // weight for the newest outcome
export const EMA_ALPHA_EDIT = 0.15     // lighter weight for a vendor edit
export const BIAS_MIN = 0.5
export const BIAS_MAX = 1.8
export const INITIAL_FACTOR = 1.0

/**
 * Signed demand error implied by an end-of-day outcome.
 * "1.0" means the quantity was perfect; >1.0 means we should have bought more.
 */
export const OUTCOME_RATIO = {
  sold_out: 1.20,
  just_right: 1.00,
  leftover_small: 0.90,
  leftover_medium: 0.80,
  leftover_large: 0.70,
  wasted: 0.65,
}

// ── pure maths helpers ─────────────────────────────────────────────────────

/** Clamps a bias factor to the sane range. */
export function clampFactor(value) {
  if (!Number.isFinite(value)) return INITIAL_FACTOR
  return Math.min(BIAS_MAX, Math.max(BIAS_MIN, value))
}

/**
 * One EMA step.
 *   new_factor = clamp(alpha * observed + (1 - alpha) * old)
 */
export function emaStep(oldFactor, observedRatio, alpha = EMA_ALPHA) {
  const old = Number.isFinite(oldFactor) ? oldFactor : INITIAL_FACTOR
  return clampFactor(alpha * observedRatio + (1 - alpha) * old)
}

/**
 * Returns the effective bias factor for an item + day-of-week combination.
 * Falls back through: weekday override → overall factor → 1.0.
 *
 * @param {object} itemBias   - the bias record for one item (may be undefined)
 * @param {number} [weekday]  - 0 = Sunday … 6 = Saturday (optional)
 * @returns {number}
 */
export function effectiveFactor(itemBias, weekday) {
  if (!itemBias) return INITIAL_FACTOR
  if (weekday != null) {
    const wd = Number(weekday)
    const wdFactor = itemBias.weekday?.[String(wd)]
    if (Number.isFinite(wdFactor)) return clampFactor(wdFactor)
  }
  return clampFactor(Number.isFinite(itemBias.factor) ? itemBias.factor : INITIAL_FACTOR)
}

/**
 * Given a DailyLog's items array, computes the bias delta for each item:
 * which factor should be applied and in which direction.
 *
 * Returns Map<itemName, { ratio, oldFactor, newFactor, weekdayNewFactor? }>
 *
 * @param {Array<{item: string, outcome: string, leftoverLevel?: string}>} logItems
 * @param {object} currentBias   - the vendor's current biasFactors from Firestore
 * @param {number} [weekday]     - 0-6 day of the log date (for weekday refinement)
 */
export function computeBiasDeltas(logItems, currentBias = {}, weekday = null) {
  const deltas = new Map()

  for (const entry of logItems) {
    const itemName = entry.item?.trim()
    if (!itemName) continue

    // Resolve the outcome key: 'leftover' alone is ambiguous (UI step),
    // but leftoverLevel produces 'leftover_small' etc.
    let outcomeKey = entry.outcome
    if (outcomeKey === 'leftover' && entry.leftoverLevel) {
      outcomeKey = `leftover_${entry.leftoverLevel}`
    }

    const ratio = OUTCOME_RATIO[outcomeKey]
    if (ratio === undefined) continue          // unknown outcome, skip

    const itemBias = currentBias[itemName] ?? {}
    const oldFactor = clampFactor(Number.isFinite(itemBias.factor) ? itemBias.factor : INITIAL_FACTOR)
    const newFactor = emaStep(oldFactor, ratio, EMA_ALPHA)

    const delta = { ratio, oldFactor, newFactor }

    // Per-weekday refinement when the day-of-week is known.
    if (weekday != null) {
      const wdKey = String(weekday)
      const oldWdFactor = itemBias.weekday?.[wdKey]
      const oldWd = Number.isFinite(oldWdFactor) ? oldWdFactor : newFactor   // seed from overall if first time
      delta.weekdayNewFactor = emaStep(oldWd, ratio, EMA_ALPHA)
      delta.weekday = weekday
    }

    deltas.set(itemName, delta)
  }

  return deltas
}

/**
 * Given vendor edits from the approval step, nudges bias in the edit direction.
 * An edit from X to Y implies observed_ratio = Y / X (capped to avoid extremes).
 *
 * Returns Map<itemName, { ratio, oldFactor, newFactor }>
 *
 * @param {Array<{item: string, from: string|null, to: string|null}>} edits
 * @param {object} currentBias
 */
export function computeEditDeltas(edits, currentBias = {}) {
  const deltas = new Map()

  for (const edit of edits) {
    const itemName = edit.item?.trim()
    if (!itemName) continue

    const fromVal = parseEditQuantity(edit.from)
    const toVal = parseEditQuantity(edit.to)
    if (!Number.isFinite(fromVal) || fromVal <= 0 || !Number.isFinite(toVal)) continue

    // ratio = toVal / fromVal; clamp to avoid wild signals from rounding
    const ratio = clampFactor(toVal / fromVal)

    const itemBias = currentBias[itemName] ?? {}
    const oldFactor = clampFactor(Number.isFinite(itemBias.factor) ? itemBias.factor : INITIAL_FACTOR)
    const newFactor = emaStep(oldFactor, ratio, EMA_ALPHA_EDIT)

    deltas.set(itemName, { ratio, oldFactor, newFactor })
  }

  return deltas
}

/** Parses "12 kg", "8", etc. into a number. */
function parseEditQuantity(text) {
  if (typeof text === 'number') return text
  if (typeof text !== 'string') return null
  const match = text.trim().match(/^(-?\d+(?:\.\d+)?)/)
  return match ? Number.parseFloat(match[1]) : null
}

// ── Firestore writes ───────────────────────────────────────────────────────

/**
 * Applies a computed delta map to the vendor's biasFactors in Firestore.
 * Returns { updated: string[], skipped: string[], error? } — never throws.
 *
 * @param {string} vendorId
 * @param {Map<string, {newFactor, weekday?, weekdayNewFactor?}>} deltas
 * @param {{ db? }} [opts]
 */
export async function applyBiasDeltas(vendorId, deltas, { db } = {}) {
  if (!vendorId || !deltas?.size) {
    return { updated: [], skipped: [] }
  }

  try {
    const database = db ?? getDb()
    const vendorRef = database.collection('vendors').doc(vendorId)
    const snap = await vendorRef.get()
    const existing = snap.exists ? (snap.data()?.biasFactors ?? {}) : {}

    const updates = {}
    const updated = []

    for (const [itemName, delta] of deltas) {
      const prev = existing[itemName] ?? {}
      const nextFactor = delta.newFactor

      const nextEntry = {
        factor: round4(nextFactor),
        weekday: { ...(prev.weekday ?? {}) },
        updatedAt: new Date().toISOString(),
      }

      if (delta.weekday != null && Number.isFinite(delta.weekdayNewFactor)) {
        nextEntry.weekday[String(delta.weekday)] = round4(delta.weekdayNewFactor)
      }

      updates[itemName] = nextEntry
      updated.push(itemName)
    }

    if (Object.keys(updates).length > 0) {
      // merge: never overwrites items not in this run
      await vendorRef.set(
        { biasFactors: { ...existing, ...updates }, biasUpdatedAt: new Date().toISOString() },
        { merge: true },
      )
    }

    return { updated, skipped: [] }
  } catch (error) {
    console.warn('[bias] applyBiasDeltas failed:', error?.message ?? error)
    return {
      updated: [],
      skipped: [...deltas.keys()],
      error: `Firestore bias write failed: ${error?.message ?? error}`,
    }
  }
}

/**
 * High-level helper: given a DailyLog's items and the vendor's current bias,
 * computes and persists updated bias factors.  Called from the logs route
 * after a successful save.
 *
 * Returns { updated: string[], skipped: string[], biasExplanations: string[] }
 *
 * @param {string} vendorId
 * @param {Array<{item,outcome,leftoverLevel?}>} logItems
 * @param {string} [dateStr]  - ISO date (YYYY-MM-DD) for weekday inference
 * @param {{ db? }} [opts]
 */
export async function updateBiasFromLog(vendorId, logItems, dateStr, { db } = {}) {
  try {
    const database = db ?? getDb()
    const snap = await database.collection('vendors').doc(vendorId).get()
    const currentBias = snap.exists ? (snap.data()?.biasFactors ?? {}) : {}

    // Infer weekday from the date string (Asia/Kolkata)
    let weekday = null
    if (dateStr) {
      try {
        const d = new Date(`${dateStr}T00:00:00+05:30`)
        weekday = d.getDay()   // 0 = Sunday … 6 = Saturday
      } catch {
        // non-critical
      }
    }

    const deltas = computeBiasDeltas(logItems, currentBias, weekday)
    const result = await applyBiasDeltas(vendorId, deltas, { db: database })

    // Build human-readable explanations for the UI
    const biasExplanations = []
    for (const [itemName, delta] of deltas) {
      const pct = Math.round(Math.abs(delta.newFactor - 1) * 100)
      if (pct < 2) continue   // too small to mention
      const direction = delta.newFactor < 1 ? 'reduce' : 'increase'
      const dirHi = delta.newFactor < 1 ? 'कम' : 'बढ़ा'
      biasExplanations.push(
        `Based on your history, I'll ${direction} ${itemName} recommendations by ~${pct}% (${dirHi} लगभग ${pct}%)`,
      )
    }

    return {
      updated: result.updated,
      skipped: result.skipped ?? [],
      biasExplanations,
      error: result.error,
    }
  } catch (error) {
    console.warn('[bias] updateBiasFromLog failed:', error?.message ?? error)
    return { updated: [], skipped: [], biasExplanations: [], error: String(error?.message ?? error) }
  }
}

/**
 * High-level helper: given the vendor edits from humanApproval, nudge bias.
 * Called from save.js after the run is persisted.
 *
 * @param {string} vendorId
 * @param {Array<{item,from,to}>} edits
 * @param {{ db? }} [opts]
 */
export async function updateBiasFromEdits(vendorId, edits, { db } = {}) {
  if (!vendorId || !edits?.length) return { updated: [], skipped: [] }

  try {
    const database = db ?? getDb()
    const snap = await database.collection('vendors').doc(vendorId).get()
    const currentBias = snap.exists ? (snap.data()?.biasFactors ?? {}) : {}

    const deltas = computeEditDeltas(edits, currentBias)
    return await applyBiasDeltas(vendorId, deltas, { db: database })
  } catch (error) {
    console.warn('[bias] updateBiasFromEdits failed:', error?.message ?? error)
    return { updated: [], skipped: [], error: String(error?.message ?? error) }
  }
}

/**
 * Builds a human-readable map of bias adjustments from the vendor's current
 * biasFactors, for use in the explain node or the UI.
 *
 * Returns string[] — empty when no meaningful bias is set.
 *
 * @param {object} bias         - the bias record from state
 * @param {string[]} items      - the items in this run
 * @param {number} [weekday]    - 0-6 (optional, for weekday-specific factors)
 */
export function describeBiasAdjustments(bias, items, weekday = null) {
  if (!bias || !items?.length) return []
  const lines = []

  for (const itemName of items) {
    const itemBias = bias[itemName]
    if (!itemBias) continue

    const factor = effectiveFactor(itemBias, weekday)
    const pct = Math.round(Math.abs(factor - 1) * 100)
    if (pct < 3) continue   // skip negligible adjustments

    const direction = factor < 1 ? 'reduced' : 'increased'
    const dirHi = factor < 1 ? 'घटाई' : 'बढ़ाई'
    lines.push(
      `${itemName}: ${direction} by ~${pct}% based on your history (${dirHi} लगभग ${pct}%)`,
    )
  }

  return lines
}

// ── utilities ──────────────────────────────────────────────────────────────

function round4(value) {
  return Math.round(value * 10000) / 10000
}

