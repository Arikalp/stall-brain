import { LRUCache } from 'lru-cache'

const rateCache = new LRUCache({
  max: 1000,
  ttl: 60 * 1000, // 1 minute
})

const MAX_REQUESTS_PER_MINUTE = 60

/**
 * Checks rate limit for a vendor.
 * Returns { limited: boolean, count: number }
 */
export function checkRateLimit(vendorId) {
  if (!vendorId) return { limited: false, count: 0 }
  
  const current = rateCache.get(vendorId) ?? 0
  const next = current + 1
  rateCache.set(vendorId, next)

  if (next > MAX_REQUESTS_PER_MINUTE) {
    return { limited: true, count: next }
  }

  return { limited: false, count: next }
}
