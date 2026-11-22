import { apiRequest } from './api'

/**
 * Sends a spoken Hindi/Hinglish inventory transcript to the backend for
 * structured parsing into { item, quantity, unit }[] (T3.1).
 *
 * @param {string} transcript
 * @param {string[]} knownItems
 * @returns {Promise<{transcript: string, items: Array<{item: string, quantity: number, unit: string}>, method: string}>}
 */
export async function parseVoiceInventory(transcript, knownItems = []) {
  return apiRequest('/api/voice/parse-inventory', {
    method: 'POST',
    body: { transcript, knownItems },
  })
}

