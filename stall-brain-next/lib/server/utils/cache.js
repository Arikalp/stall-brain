import { LRUCache } from 'lru-cache'
import { config } from '../config.js'

/**
 * In-memory TTL LRU cache for market signals (T4.3):
 * weather, festivals, local events, and mandi prices.
 * Prevents redundant external API calls within a 30–45 minute window.
 */
const DEFAULT_TTL_MS = config.signalCacheTtlMs ?? 30 * 60 * 1000

const cache = new LRUCache({
  max: 128,
  ttl: DEFAULT_TTL_MS,
})

const stats = {
  hits: 0,
  misses: 0,
}

export async function cachedLookup(key, loader, { ttlMs, bypass = false } = {}) {
  if (bypass) {
    return loader()
  }

  const cached = cache.get(key)
  if (cached !== undefined) {
    stats.hits += 1
    return cached
  }

  stats.misses += 1
  const value = await loader()
  if (value !== undefined && value !== null) {
    cache.set(key, value, ttlMs ? { ttl: ttlMs } : undefined)
  }
  return value
}

export function clearSignalCache() {
  cache.clear()
  stats.hits = 0
  stats.misses = 0
}

export function getSignalCacheStats() {
  return {
    size: cache.size,
    hits: stats.hits,
    misses: stats.misses,
  }
}

