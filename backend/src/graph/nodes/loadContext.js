import { getVendorContext } from '../../store/firestore.js'

/**
 * Loads vendor context (T1.9): profile/inventory from the request, plus the
 * last 14-30 DailyLog entries and learned bias factors from Firestore.
 * Degrades gracefully: empty history/bias when Firestore is unavailable.
 *
 * Side-effect free (important: this node runs before interrupt()).
 */
export async function loadContext(state, deps = {}) {
  const request = state.request ?? {}

  const profile = {
    stallType: request.stall?.id || 'unknown',
    stallLabel: request.stall?.name || 'Unknown stall',
    stallEmoji: '🏪',
    ingredients: request.items?.length ? request.items : (request.stall?.items ?? []),
  }

  const finalItems = request.items?.length ? request.items : (request.stall?.items ?? [])
  const inventory = Object.fromEntries(
    finalItems.map((item) => [
      item,
      request.inventory?.[item] ?? { quantity: 0, unit: 'units' },
    ]),
  )

  const context = deps.skipFirestore
    ? { history: [], bias: {}, storedProfile: null }
    : await getVendorContext(state.vendorId, { db: deps.db })

  const storedProfile = context.storedProfile ?? null
  const rawBudget = request.budgetInr ?? storedProfile?.dailyBudgetInr ?? null
  const budgetInr =
    rawBudget != null && Number.isFinite(Number(rawBudget)) && Number(rawBudget) >= 0
      ? Number(rawBudget)
      : null
  const itemPrices = {
    ...(storedProfile?.itemPrices ?? {}),
    ...(request.itemPrices ?? {}),
  }

  const trace = [
    `Loaded context for ${profile.stallLabel} (${finalItems.length} items)`,
    ...(budgetInr != null ? [`Daily budget cap: ₹${budgetInr}`] : []),
    context.history.length
      ? `History: last ${context.history.length} day(s) of logs`
      : 'History: none yet (new vendor)',
    Object.keys(context.bias).length
      ? `Learned bias factors: ${Object.keys(context.bias).length} item(s)`
      : 'Bias factors: none yet',
    ...(context.error ? [context.error] : []),
  ]

  return {
    profile,
    sessionIngredients: finalItems,
    inventory,
    budgetInr,
    itemPrices,
    history: context.history,
    bias: context.bias,
    date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date()),
    trace,
  }
}
