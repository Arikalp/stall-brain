import { apiRequest } from './api'

export async function fetchGroupBuying({ lane, date } = {}) {
  const params = new URLSearchParams()
  if (lane) params.set('lane', lane)
  if (date) params.set('date', date)
  const qs = params.toString()
  return apiRequest(`/api/group-buying${qs ? `?${qs}` : ''}`)
}

export async function toggleGroupBuyingOptIn({ optIn, lane, date, items }) {
  return apiRequest('/api/group-buying/opt-in', {
    method: 'POST',
    body: { optIn, lane, date, items },
  })
}

