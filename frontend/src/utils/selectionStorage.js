const SELECTION_KEY = 'bazaarBrainSelection'

function sanitizeItems(items) {
  if (!Array.isArray(items)) return []
  return items
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item) => item.length > 0)
}

export function loadSelection() {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(SELECTION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || !parsed.stallId) return null

    return {
      stallId: parsed.stallId,
      items: sanitizeItems(parsed.items),
      confirmed: Boolean(parsed.confirmed),
    }
  } catch (error) {
    return null
  }
}

export function saveSelection(selection) {
  if (typeof window === 'undefined') return
  if (!selection?.stallId) return

  const payload = {
    stallId: selection.stallId,
    items: sanitizeItems(selection.items),
    confirmed: Boolean(selection.confirmed),
  }

  localStorage.setItem(SELECTION_KEY, JSON.stringify(payload))
}

export function clearSelection() {
  if (typeof window === 'undefined') return
  localStorage.removeItem(SELECTION_KEY)
}
