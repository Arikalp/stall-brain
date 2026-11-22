import { ValidationResultSchema } from '../../schemas.js'
import { getShelfLifeEntry } from '../../data/baselines.js'
import { computePlanFinancials } from '../../utils/economics.js'
import { analyzeTomorrowLookahead, getPerishableCap } from './forecast.js'

/** Maximum number of planner attempts before falling back to the draft. */
export const MAX_PLAN_RETRIES = 3

/** Rounding tolerance when checking toBuy = totalNeeded - alreadyHave. */
const ARITHMETIC_TOLERANCE = 0.05
/** The planner may adjust the deterministic draft by at most +/-25%. */
const ADJUSTMENT_BAND = 0.25

/**
 * Parses "12 kg", "0.5 litre", "8" into { value, unit }.
 * Returns null when the quantity cannot be parsed.
 */
export function parseQuantity(text) {
  if (typeof text === 'number') {
    return Number.isFinite(text) ? { value: text, unit: null } : null
  }
  if (typeof text !== 'string') return null
  const match = text.trim().match(/^(-?\d+(?:\.\d+)?)\s*([a-zA-Z.]*)$/)
  if (!match) return null
  const value = Number.parseFloat(match[1])
  if (!Number.isFinite(value)) return null
  return { value, unit: match[2].replace(/\.$/, '') || null }
}

/** Case/whitespace-insensitive item name comparison. */
function normalizeName(name) {
  return String(name ?? '').trim().toLowerCase()
}

/**
 * The code-based critic. Checks the LLM plan against the deterministic draft
 * and the vendor's session. Pure: no side effects, never calls the LLM.
 */
export function validatePlan({
  plan,
  draftPlan,
  sessionIngredients,
  budgetInr,
  prices,
  itemPrices,
  signalErrors,
  signals,
  stallType,
}) {
  const errors = []

  if (!plan) {
    return ValidationResultSchema.parse({ valid: false, errors: ['No plan was produced.'] })
  }

  // 7. Degraded signals must not carry high confidence (T1.3 acceptance:
  // a failing tool still yields a forecast with a lower confidence level).
  if (signalErrors?.length > 0 && plan.confidenceLevel === 'High') {
    errors.push(
      'Some live signals failed to load, so confidenceLevel must be "Medium" or "Low" (not "High").',
    )
  }

  const draftItems = draftPlan?.items ?? []

  // 1 & 2. Per-item arithmetic self-consistency, non-negativity, unit match.
  for (const item of plan.procurementList ?? []) {
    const totalNeeded = parseQuantity(item.totalNeeded)
    const alreadyHave = parseQuantity(item.alreadyHave)
    const toBuy = parseQuantity(item.toBuy)

    if (!totalNeeded || !alreadyHave || !toBuy) {
      errors.push(`Could not parse quantities for "${item.item}".`)
      continue
    }
    if (toBuy.value < 0 || totalNeeded.value < 0 || alreadyHave.value < 0) {
      errors.push(`Negative quantity for "${item.item}".`)
    }

    const expected = Math.max(0, totalNeeded.value - alreadyHave.value)
    if (Math.abs(toBuy.value - expected) > ARITHMETIC_TOLERANCE) {
      errors.push(
        `"${item.item}" toBuy is ${item.toBuy}, but totalNeeded - alreadyHave = ${expected}. Recompute.`,
      )
    }

    // 6. Adjustments must stay within the allowed band vs the deterministic draft.
    const draftItem = draftItems.find(
      (draft) => normalizeName(draft.item) === normalizeName(item.item),
    )
    if (draftItem) {
      if (
        Math.abs(totalNeeded.value - draftItem.totalNeeded) >
        draftItem.totalNeeded * ADJUSTMENT_BAND + 0.01
      ) {
        errors.push(
          `"${item.item}" totalNeeded (${item.totalNeeded}) deviates more than 25% from the deterministic draft (${draftItem.totalNeeded} ${draftItem.unit}). Adjust within +/-25% of the draft.`,
        )
      }
      if (item.unit && normalizeName(item.unit) !== normalizeName(draftItem.unit)) {
        errors.push(
          `"${item.item}" unit "${item.unit}" does not match the vendor's unit "${draftItem.unit}".`,
        )
      }
    }
  }

  // 3. Coverage: every session ingredient appears exactly once.
  const listed = (plan.procurementList ?? []).map((item) => normalizeName(item.item))
  const sufficient = (plan.sufficientStockItems ?? []).map(normalizeName)

  if (new Set(listed).size !== listed.length) {
    errors.push('Duplicate items in procurementList.')
  }
  if (new Set(sufficient).size !== sufficient.length) {
    errors.push('Duplicate items in sufficientStockItems.')
  }

  for (const ingredient of sessionIngredients ?? []) {
    const key = normalizeName(ingredient)
    const inList = listed.includes(key)
    const inSufficient = sufficient.includes(key)
    if (inList && inSufficient) {
      errors.push(`"${ingredient}" appears in both procurementList and sufficientStockItems.`)
    } else if (!inList && !inSufficient) {
      errors.push(`"${ingredient}" is missing from the plan entirely.`)
    }
  }

  // 4. Budget: enforce daily budget cap when set (T3.2).
  if (budgetInr != null && Number.isFinite(Number(budgetInr))) {
    const financials = computePlanFinancials({
      procurementList: plan.procurementList ?? [],
      sufficientStockItems: plan.sufficientStockItems ?? [],
      draftPlan,
      vendorPrices: itemPrices,
      signalPrices: prices,
      budgetInr,
    })
    if (!financials.withinBudget) {
      errors.push(
        `Total procurement cost (₹${financials.totalCostInr}) exceeds daily budget (₹${financials.budgetInr}). Reduce quantities of lower-margin items to stay within ₹${financials.budgetInr}.`,
      )
    }
  }

  // 5. Perishable shelf-life caps (T3.3 + T3.4): never over-buy fresh items
  // beyond safe shelf life or into bad tomorrow weather.
  const lookaheadSummary = analyzeTomorrowLookahead(signals)
  for (const item of plan.procurementList ?? []) {
    const shelf = getShelfLifeEntry(item.item, stallType)
    if (!shelf.perishable) continue
    const totalNeeded = parseQuantity(item.totalNeeded)
    if (!totalNeeded) continue
    const draftItem = draftItems.find(
      (draft) => normalizeName(draft.item) === normalizeName(item.item),
    )
    const cap = getPerishableCap(
      {
        baseline: draftItem?.baseline ?? shelf.baseline,
        perishable: true,
        shelfLifeDays: shelf.shelfLifeDays,
      },
      draftPlan?.combinedMultiplier ?? 1,
      lookaheadSummary,
    )
    if (totalNeeded.value > cap + ARITHMETIC_TOLERANCE) {
      errors.push(
        `"${item.item}" totalNeeded (${item.totalNeeded}) exceeds perishable shelf-life cap (${cap} ${shelf.unit}, ${shelf.shelfLifeDays}d${lookaheadSummary.tomorrowBadWeather && shelf.shelfLifeDays <= 2 ? ' + bad weather tomorrow' : ''}). Reduce quantity to avoid spoilage.`,
      )
    }
  }

  return ValidationResultSchema.parse({ valid: errors.length === 0, errors })
}

/**
 * Deterministic fallback: converts the numeric draft into the ForecastResult
 * shape the frontend consumes, marked low-confidence. Used after 3 failed
 * planner attempts (routing rule from the plan).
 */
export function buildFallbackPlan(
  draftPlan,
  multiplier,
  { itemPrices = {}, prices = [], budgetInr = null } = {},
) {
  const draft = draftPlan ?? { items: [], sufficientStockItems: [] }
  const procurementList = draft.items.map((item) => ({
    item: item.item,
    totalNeeded: `${item.totalNeeded} ${item.unit}`,
    alreadyHave: `${item.alreadyHave} ${item.unit}`,
    toBuy: `${item.toBuy} ${item.unit}`,
    unit: item.unit,
    priority: item.toBuy >= item.baseline * 0.5 ? 'essential' : 'moderate',
    note: 'Deterministic fallback plan.',
  }))

  const financials = computePlanFinancials({
    procurementList,
    sufficientStockItems: draft.sufficientStockItems ?? [],
    draftPlan: draft,
    vendorPrices: itemPrices,
    signalPrices: prices,
    budgetInr: budgetInr ?? draft.budgetInr ?? null,
  })

  return {
    summary:
      'AI planning failed validation after 3 attempts, so this plan comes straight from the deterministic calculation.',
    hindiSummary:
      'AI योजना 3 बार सत्यापन में फेल हो गई, इसलिए यह योजना सीधे गणना से बनी है।',
    expectedCustomers: draft.expectedCustomers ?? 150,
    peakHours: '12-2pm and 6-9pm',
    confidenceLevel: 'Low',
    confidenceReason:
      'Computed by code only; the LLM plan failed validation 3 times.',
    procurementList,
    sufficientStockItems: draft.sufficientStockItems,
    specialAdvice:
      'Double-check quantities yourself today. || आज मात्रा खुद जांच लें।',
    financials,
  }
}

/**
 * Validator node: routes bad plans back to the planner (up to 3 attempts),
 * then falls back to the deterministic draft with low confidence.
 */
export async function validate(state) {
  const result = validatePlan({
    plan: state.plan,
    draftPlan: state.draftPlan,
    sessionIngredients: state.sessionIngredients,
    budgetInr: state.budgetInr,
    prices: state.signals?.prices,
    itemPrices: state.itemPrices,
    signalErrors: state.signals?.errors,
    signals: state.signals,
    stallType: state.profile?.stallType,
  })

  if (result.valid) {
    const financials = computePlanFinancials({
      procurementList: state.plan?.procurementList ?? [],
      sufficientStockItems: state.plan?.sufficientStockItems ?? [],
      draftPlan: state.draftPlan,
      vendorPrices: state.itemPrices,
      signalPrices: state.signals?.prices,
      budgetInr: state.budgetInr,
    })
    return {
      plan: {
        ...state.plan,
        financials,
      },
      validationErrors: [],
      trace: [`Validator: plan accepted (est. cost ₹${financials.totalCostInr}, profit ₹${financials.expectedProfitInr})`],
    }
  }

  const nextRetry = (state.retryCount ?? 0) + 1

  if (nextRetry >= MAX_PLAN_RETRIES) {
    // Give up on the LLM: ship the deterministic draft, low confidence.
    return {
      plan: buildFallbackPlan(state.draftPlan, state.multiplier, {
        itemPrices: state.itemPrices,
        prices: state.signals?.prices,
        budgetInr: state.budgetInr,
      }),
      validationErrors: [],
      trace: [
        `Validator: rejected plan ${nextRetry}x (${result.errors.join('; ')})`,
        'Falling back to the deterministic draft with low confidence.',
      ],
    }
  }

  return {
    validationErrors: result.errors,
    retryCount: nextRetry,
    trace: [
      `Validator: rejected plan (${result.errors.join('; ')}), retrying planner (${nextRetry}/${MAX_PLAN_RETRIES})`,
    ],
  }
}
