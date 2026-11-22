import { API_BASE, apiRequest, getAccessToken } from './api'

/**
 * Forecast agent client (T1.8 / T1.10).
 *
 * The backend runs the LangGraph agent server-side; the browser authenticates
 * with its Firebase ID token. Two round-trips:
 *
 *   1. requestForecastStream - POST /api/forecast/stream (Server-Sent Events).
 *      Forwards live agent steps to `onStep` and resolves with either
 *      PENDING_APPROVAL (the graph paused for the vendor's decision) or DONE.
 *
 *   2. resumeForecast - POST /api/forecast/resume with the vendor's decision
 *      ({ approved, editedPlan? }) on the same runId/thread.
 */

/** Parses one SSE block ("event: x\\ndata: {...}") into { event, data }. */
function parseSseBlock(block) {
  let event = 'message'
  let data = ''
  for (const line of block.split('\n')) {
    if (line.startsWith('event:')) {
      event = line.slice(6).trim()
    } else if (line.startsWith('data:')) {
      data += line.slice(5).trim()
    }
  }
  if (!data) return null
  try {
    return { event, data: JSON.parse(data) }
  } catch {
    return null
  }
}

function makeError(code, message) {
  const error = new Error(message ?? code)
  error.code = code
  return error
}

/**
 * Streams the forecast run over SSE with fetch + ReadableStream.
 *
 * @param {object} payload forecast request body
 * @param {(step: string) => void} [onStep] called for every progress line
 * @returns {Promise<{status: 'PENDING_APPROVAL'|'DONE', runId: string, plan: object, trace?: string[]}>}
 */
export async function requestForecastStream(payload, onStep) {
  const token = await getAccessToken()

  let response
  try {
    response = await fetch(`${API_BASE}/api/forecast/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    })
  } catch {
    throw makeError('NETWORK_ERROR')
  }

  if (!response.ok || !response.body) {
    let payloadError = null
    try {
      payloadError = await response.json()
    } catch {
      // Non-JSON error body.
    }
    if (response.status === 401) throw makeError('AUTH_REQUIRED')
    if (response.status === 429) throw makeError('RATE_LIMITED')
    throw makeError(payloadError?.error ?? 'REQUEST_FAILED', payloadError?.message)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  const result = { status: null, runId: null, plan: null, trace: [] }
  let streamError = null

  const handleEvent = ({ event, data }) => {
    switch (event) {
      case 'meta':
        result.runId = data.runId ?? result.runId
        break
      case 'step':
        if (data.step && onStep) onStep(data.step)
        break
      case 'pending':
        result.status = 'PENDING_APPROVAL'
        result.runId = data.runId ?? result.runId
        result.plan = data.plan ?? null
        break
      case 'done':
        result.status = 'DONE'
        result.runId = data.runId ?? result.runId
        result.plan = data.plan ?? null
        result.simulation = Boolean(data.simulation)
        break
      case 'error':
        streamError = makeError(
          'FORECAST_UNAVAILABLE',
          data.message ?? 'The forecast run failed.',
        )
        break
      case 'end':
        break
      default:
        break
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    let separatorIndex
    while ((separatorIndex = buffer.indexOf('\n\n')) !== -1) {
      const block = buffer.slice(0, separatorIndex)
      buffer = buffer.slice(separatorIndex + 2)
      const parsed = parseSseBlock(block)
      if (parsed) handleEvent(parsed)
    }
  }

  if (streamError) throw streamError
  if (!result.status || !result.plan) {
    throw makeError('FORECAST_INVALID')
  }
  return result
}

/**
 * Resumes a paused run with the vendor's decision.
 *
 * @param {string} runId thread the run is paused on
 * @param {{approved: boolean, editedPlan?: object}} decision
 * @returns {Promise<{status: 'PENDING_APPROVAL'|'DONE', runId: string, plan: object, trace?: string[]}>}
 */
export async function resumeForecast(runId, decision) {
  const result = await apiRequest('/api/forecast/resume', {
    method: 'POST',
    body: { runId, approved: decision.approved, editedPlan: decision.editedPlan },
  })

  if (!result || typeof result !== 'object' || !result.plan) {
    throw makeError('FORECAST_INVALID')
  }
  return result
}
