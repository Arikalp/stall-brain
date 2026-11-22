import { apiRequest } from './api'

/**
 * Sends a spoken Hindi/Hinglish audio Blob or text transcript to the backend for
 * structured parsing into { item, quantity, unit }[] using Groq Whisper + LLM.
 *
 * @param {string|Blob|File} input Spoken transcript or raw audio recording Blob.
 * @param {string[]} knownItems
 * @param {{ signal?: AbortSignal }} [options]
 * @returns {Promise<{transcript: string, items: Array<{item: string, quantity: number, unit: string}>, method: string}>}
 */
export async function parseVoiceInventory(input, knownItems = [], { signal } = {}) {
  if (typeof Blob !== 'undefined' && (input instanceof Blob || input instanceof File)) {
    const formData = new FormData()
    formData.append('audio', input, 'recording.webm')
    if (knownItems?.length) {
      formData.append('knownItems', JSON.stringify(knownItems))
    }
    return apiRequest('/api/voice/parse-inventory', {
      method: 'POST',
      body: formData,
      signal,
    })
  }

  return apiRequest('/api/voice/parse-inventory', {
    method: 'POST',
    body: { transcript: String(input || ''), knownItems },
    signal,
  })
}
