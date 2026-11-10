import rateLimit, { ipKeyGenerator } from 'express-rate-limit'

/**
 * Rate limit per vendor (authenticated uid), falling back to IP for
 * unauthenticated requests (which fail auth anyway).
 * Mount AFTER requireAuth so req.vendorId is populated.
 */
export const vendorRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  // ipKeyGenerator handles IPv6 addresses safely for the fallback case.
  keyGenerator: (req) => req.vendorId ?? ipKeyGenerator(req.ip),
  handler: (_req, res) => {
    res.status(429).json({
      error: 'RATE_LIMITED',
      message: 'Too many forecast requests. Please try again in a few minutes.',
    })
  },
})
