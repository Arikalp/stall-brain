import {
  festivalImpact,
  matchImpact,
  MULTIPLIER_BOUNDS,
  stallBaselines,
} from '../../data/baselines.js'

/** Clamps a demand multiplier to a sane range so bad signals can't explode it. */
export function clampMultiplier(value) {
  const { min, max } = MULTIPLIER_BOUNDS
  if (!Number.isFinite(value)) return 1
  return Math.min(max, Math.max(min, value))
}

/** Festival factor from signals; 1 when none reported. */
export function festivalFactor(signals) {
  const impacts = (signals?.festivals ?? []).map(
    (festival) => festivalImpact[festival?.impact] ?? 1,
  )
  return impacts.length ? Math.max(...impacts) : 1
}

/** Cricket match factor from signals; 1 when no match scheduled. */
export function matchFactor(signals) {
  const crowd = signals?.match?.expectedCrowd
  return crowd ? (matchImpact[crowd] ?? 1) : 1
}

/**
 * Converts an inventory quantity into the item's canonical baseline unit.
 * Supports the frontend's INVENTORY_UNITS; unknown pairs return null so the
 * caller can fall back to treating units as-is.
 */
export function convertToUnit(quantity, fromUnit, toUnit) {
  const q = Number(quantity)
  if (!Number.isFinite(q) || q < 0) return 0
  if (!fromUnit || !toUnit || fromUnit === toUnit) return q

  const table = {
    kg: { g: q / 1000 },
    g: { kg: q * 1000 },
    litres: { ml: q / 1000 },
    pieces: { dozen: q * 12 },
    dozen: { pieces: q / 12 },
  }
  return table[toUnit]?.[fromUnit] ?? null
}

/** Looks up the baseline entry for an item, with a sane fallback. */
export function getBaselineEntry(item, stallType) {
  const byStall = stallBaselines[stallType]
  const entry = byStall?.[item]
  if (entry) return entry
  // Unknown item or stall: generic fallback so the plan still covers it.
  return { baseline: 5, unit: 'units' }
}

/**
 * Computes the deterministic numeric plan. Pure: same inputs always produce
 * the same numbers, and the LLM never does this arithmetic.
 *
 *   combined   = weather x event x weekday x festival x match  (clamped)
 *   totalNeeded = baseline x combined x bias[item]
 *   toBuy      = max(0, totalNeeded - alreadyHave)
 */
export function computeDraftPlan({
  stallType,
  items,
  inventory,
  multiplier,
  signals,
  bias,
}) {
  const festival = festivalFactor(signals)
  const match = matchFactor(signals)
  const combined = clampMultiplier(
    (multiplier?.weather ?? 1) *
      (multiplier?.event ?? 1) *
      (multiplier?.weekday ?? 1) *
      festival *
      match,
  )

  const draftItems = []
  const sufficientStockItems = []

  for (const item of items) {
    const entry = getBaselineEntry(item, stallType)
    const stock = inventory?.[item] ?? { quantity: 0, unit: entry.unit }
    const biasFactor = Number(bias?.[item])

    const alreadyHave =
      convertToUnit(stock.quantity, stock.unit, entry.unit) ?? stock.quantity
    const totalNeeded =
      entry.baseline * combined * (Number.isFinite(biasFactor) ? biasFactor : 1)
    const toBuy = Math.max(0, totalNeeded - alreadyHave)

    if (toBuy <= 0) {
      sufficientStockItems.push(item)
      continue
    }

    draftItems.push({
      item,
      unit: entry.unit,
      baseline: entry.baseline,
      bias: Number.isFinite(biasFactor) ? biasFactor : 1,
      totalNeeded: round2(totalNeeded),
      alreadyHave: round2(alreadyHave),
      toBuy: round2(toBuy),
    })
  }

  return {
    items: draftItems,
    sufficientStockItems,
    expectedCustomers: Math.round(150 * combined),
    combinedMultiplier: round3(combined),
    factors: { weather: multiplier?.weather ?? 1, event: multiplier?.event ?? 1, weekday: multiplier?.weekday ?? 1, festival, match },
  }
}

function round2(value) {
  return Math.round(value * 100) / 100
}

function round3(value) {
  return Math.round(value * 1000) / 1000
}

/**
 * Deterministic forecast node. All arithmetic happens here in code, never in
 * the LLM; the draft is stored in state for the planner to review (T1.5).
 * Side-effect free.
 */
export async function forecastDemand(state) {
  const items = state.sessionIngredients ?? []
  const combined = (state.multiplier?.combined ?? 1)

  const draftPlan = computeDraftPlan({
    stallType: state.profile?.stallType,
    items,
    inventory: state.inventory,
    multiplier: state.multiplier,
    signals: state.signals,
    bias: state.bias,
  })

  return {
    baseline: Object.fromEntries(
      items.map((item) => [item, getBaselineEntry(item, state.profile?.stallType).baseline]),
    ),
    draftPlan,
    trace: [
      `Demand multiplier x${combined} -> clamped x${draftPlan.combinedMultiplier}`,
      `Deterministic draft: ${draftPlan.items.length} item(s) to buy, ${draftPlan.sufficientStockItems.length} sufficient`,
    ],
  }
}
