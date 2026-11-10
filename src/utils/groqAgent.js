import { apiRequest } from './api'

/**
 * Requests today's forecast from the backend.
 *
 * The Groq API key lives only in the backend env now; the browser authenticates
 * with its Firebase ID token and the backend does the LLM call server-side.
 * Keeps the same signature and return shape the ForecastPage already consumes.
 */
export async function requestGroqForecast(payload) {
  const result = await apiRequest('/api/forecast', {
    method: 'POST',
    body: payload,
  })

  if (!result || typeof result !== 'object' || !Array.isArray(result.procurementList)) {
    const error = new Error('FORECAST_INVALID')
    error.code = 'FORECAST_INVALID'
    throw error
  }

  return result
}
