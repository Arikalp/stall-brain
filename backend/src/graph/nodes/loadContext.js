/**
 * Loads vendor context: profile, inventory, last 14-30 daily logs, and learned
 * bias factors. Firestore-backed in T2.2/T1.9; for now the request payload
 * carries the profile/inventory and history/bias default to empty.
 *
 * Side-effect free.
 */
export async function loadContext(state) {
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

  return {
    profile,
    sessionIngredients: finalItems,
    inventory,
    budgetInr: null,
    history: [],
    bias: {},
    date: new Date().toISOString().slice(0, 10),
    trace: [`Loaded context for ${profile.stallLabel} (${finalItems.length} items)`],
  }
}
