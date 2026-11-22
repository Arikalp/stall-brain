import { createHash } from 'node:crypto'
import { config } from '../config.js'

/**
 * Observability helpers (T4.2):
 * - Privacy-preserving SHA-256 vendor hash
 * - LangGraph run config with LangSmith/Langfuse tags & metadata
 * - Per-node wall-clock timing wrapper
 */

export function hashVendorId(vendorId) {
  if (!vendorId) return 'v_anonymous'
  return (
    'v_' +
    createHash('sha256')
      .update(String(vendorId))
      .digest('hex')
      .slice(0, 12)
  )
}

export function getTracingStatus() {
  const langsmithActive = Boolean(config.langsmithTracing && config.langsmithApiKey)
  const langfuseConfigured = Boolean(
    config.langfusePublicKey && config.langfuseSecretKey,
  )
  return {
    langsmithActive,
    langsmithProject: config.langsmithProject,
    langfuseConfigured,
  }
}

export function buildRunTraceConfig({
  runId,
  vendorId,
  stallType = 'unknown',
  retryCount = 0,
  simulation = false,
} = {}) {
  const vendorHash = hashVendorId(vendorId)
  const tags = [
    `stall:${stallType}`,
    simulation ? 'mode:simulation' : 'mode:live',
    retryCount > 0 ? `retries:${retryCount}` : 'retries:0',
  ]

  return {
    configurable: {
      thread_id: runId,
    },
    runName: 'bazaar-brain-forecast',
    tags,
    metadata: {
      runId,
      vendorHash,
      stallType,
      retryCount,
      simulation: Boolean(simulation),
      tracingProvider: getTracingStatus().langsmithActive
        ? 'langsmith'
        : getTracingStatus().langfuseConfigured
          ? 'langfuse-ready'
          : 'local-timings',
    },
  }
}

