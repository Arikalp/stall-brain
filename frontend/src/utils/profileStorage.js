const PROFILE_KEY = 'bazaarBrain_profile'

export function normalizeIngredients(items) {
  if (!Array.isArray(items)) return []
  return items
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item) => item.length > 0)
}

export function normalizeItemPrices(itemPrices) {
  if (!itemPrices || typeof itemPrices !== 'object') return {}
  return Object.entries(itemPrices).reduce((acc, [item, entry]) => {
    if (typeof item !== 'string') return acc
    const key = item.trim()
    if (!key || !entry || typeof entry !== 'object') return acc
    const buy = entry.buyPrice != null && entry.buyPrice !== '' ? Number(entry.buyPrice) : null
    const sell = entry.sellPrice != null && entry.sellPrice !== '' ? Number(entry.sellPrice) : null
    const clean = {}
    if (buy != null && Number.isFinite(buy) && buy >= 0) clean.buyPrice = buy
    if (sell != null && Number.isFinite(sell) && sell >= 0) clean.sellPrice = sell
    if (Object.keys(clean).length > 0) acc[key] = clean
    return acc
  }, {})
}

function normalizeBudget(value) {
  if (value == null || value === '') return null
  const num = Number(value)
  return Number.isFinite(num) && num >= 0 ? num : null
}

function normalizeProfile(profile) {
  if (!profile) return null

  const stallType =
    typeof profile.stallType === 'string' ? profile.stallType.trim() : ''
  const stallLabel =
    typeof profile.stallLabel === 'string' ? profile.stallLabel.trim() : ''
  const stallEmoji =
    typeof profile.stallEmoji === 'string' ? profile.stallEmoji.trim() : ''
  const ingredients = normalizeIngredients(profile.ingredients)

  if (!stallType || !stallLabel || !stallEmoji) return null

  return {
    stallType,
    stallLabel,
    stallEmoji,
    ingredients,
    dailyBudgetInr: normalizeBudget(profile.dailyBudgetInr),
    itemPrices: normalizeItemPrices(profile.itemPrices),
    whatsappOptIn: Boolean(profile.whatsappOptIn),
    whatsappPhone:
      typeof profile.whatsappPhone === 'string' ? profile.whatsappPhone.trim() : '',
    lane:
      typeof profile.lane === 'string' && profile.lane.trim()
        ? profile.lane.trim()
        : 'Hazratganj',
    groupBuyingOptIn: Boolean(profile.groupBuyingOptIn),
  }
}

export function loadProfile() {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(PROFILE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return normalizeProfile(parsed)
  } catch (error) {
    return null
  }
}

export function saveProfile(profile) {
  if (typeof window === 'undefined') return null

  const normalized = normalizeProfile(profile)
  if (!normalized) return null

  localStorage.setItem(PROFILE_KEY, JSON.stringify(normalized))
  return normalized
}

export function clearProfile() {
  if (typeof window === 'undefined') return
  localStorage.removeItem(PROFILE_KEY)
}
