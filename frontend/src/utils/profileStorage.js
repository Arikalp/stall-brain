const PROFILE_KEY = 'bazaarBrain_profile'

export function normalizeIngredients(items) {
  if (!Array.isArray(items)) return []
  return items
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item) => item.length > 0)
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
