const SESSION_KEY = 'bazaarBrain_session'

export const INVENTORY_UNITS = [
  'kg',
  'g',
  'litres',
  'pieces',
  'packets',
  'dozen',
]
const DEFAULT_UNIT = INVENTORY_UNITS[0]

function normalizeIngredients(items) {
  if (!Array.isArray(items)) return []
  return items
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item) => item.length > 0)
}

function normalizeUnit(unit) {
  if (typeof unit !== 'string') return DEFAULT_UNIT
  const trimmed = unit.trim()
  return INVENTORY_UNITS.includes(trimmed) ? trimmed : DEFAULT_UNIT
}

function normalizeQuantity(value) {
  const quantity = Number(value)
  if (!Number.isFinite(quantity) || quantity < 0) return 0
  return quantity
}

function normalizeInventory(inventory) {
  if (!inventory || typeof inventory !== 'object') return {}

  return Object.entries(inventory).reduce((acc, [item, entry]) => {
    if (typeof item !== 'string') return acc
    const trimmedItem = item.trim()
    if (!trimmedItem) return acc

    acc[trimmedItem] = {
      quantity: normalizeQuantity(entry?.quantity),
      unit: normalizeUnit(entry?.unit),
    }
    return acc
  }, {})
}

function buildInventoryForItems(items, inventory) {
  const normalizedInventory = normalizeInventory(inventory)

  return items.reduce((acc, item) => {
    const trimmedItem = item.trim()
    if (!trimmedItem) return acc
    acc[trimmedItem] = normalizedInventory[trimmedItem] ?? {
      quantity: 0,
      unit: DEFAULT_UNIT,
    }
    return acc
  }, {})
}

export function createSessionFromProfile(profile) {
  const sessionIngredients = normalizeIngredients(profile?.ingredients)
  return {
    sessionIngredients,
    inventory: buildInventoryForItems(sessionIngredients, {}),
  }
}

export function loadForecastSession() {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed?.sessionIngredients)) return null

    const sessionIngredients = normalizeIngredients(parsed.sessionIngredients)
    const inventory = buildInventoryForItems(sessionIngredients, parsed.inventory)

    return {
      sessionIngredients,
      inventory,
    }
  } catch (error) {
    return null
  }
}

export function saveForecastSession({ sessionIngredients, inventory }) {
  if (typeof window === 'undefined') return
  if (!Array.isArray(sessionIngredients)) return

  const normalizedIngredients = normalizeIngredients(sessionIngredients)
  const normalizedInventory = buildInventoryForItems(
    normalizedIngredients,
    inventory,
  )

  localStorage.setItem(
    SESSION_KEY,
    JSON.stringify({
      sessionIngredients: normalizedIngredients,
      inventory: normalizedInventory,
    }),
  )
}

export function clearForecastSession() {
  if (typeof window === 'undefined') return
  localStorage.removeItem(SESSION_KEY)
}
