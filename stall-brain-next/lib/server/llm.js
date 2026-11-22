import { ChatGroq } from '@langchain/groq'
import { config } from './config.js'

/**
 * Thin wrapper around ChatGroq so the model/provider can be swapped in one place.
 * The API key only ever lives in server env (GROQ_API_KEY), never in the client bundle.
 */
let cachedLlm

export function getLlm() {
  if (!cachedLlm) {
    cachedLlm = new ChatGroq({
      apiKey: config.groqApiKey,
      model: config.groqModel,
      temperature: 0.4,
      maxTokens: 1200,
      timeout: config.llmTimeoutMs,
      maxRetries: config.llmMaxRetries,
      // llama-3.3-70b-versatile was decommissioned; gpt-oss supports reasoning effort.
      reasoningEffort: 'low',
    })
  }
  return cachedLlm
}
