import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth.js'
import { vendorRateLimit } from '../middleware/rateLimit.js'
import { VendorProfileSchema } from '../schemas.js'
import {
  getRecentRuns,
  getVendorProfile,
  saveVendorProfile,
} from '../store/firestore.js'

export const profileRouter = Router()

/**
 * Vendor data persistence (T2.2): profile, runs and logs live in Firestore
 * under vendors/{uid}/..., so clearing the browser loses nothing. The vendorId
 * always comes from the verified auth token.
 */

profileRouter.get(
  '/profile',
  requireAuth,
  vendorRateLimit,
  async (req, res, next) => {
    try {
      const { profile } = await getVendorProfile(req.vendorId)
      return res.json({ profile })
    } catch (error) {
      return next(error)
    }
  },
)

profileRouter.put(
  '/profile',
  requireAuth,
  vendorRateLimit,
  async (req, res, next) => {
    const parsedBody = VendorProfileSchema.safeParse(req.body)
    if (!parsedBody.success) {
      return res.status(400).json({
        error: 'VALIDATION_FAILED',
        message:
          'Profile must be { stallType, stallLabel, stallEmoji, ingredients[] }.',
        details: parsedBody.error.flatten().fieldErrors,
      })
    }

    try {
      const result = await saveVendorProfile(req.vendorId, parsedBody.data)
      if (!result.saved) {
        return res.status(503).json({
          error: 'SAVE_FAILED',
          message: 'Could not save your profile right now. Please try again.',
        })
      }
      return res.json({ saved: true, profile: parsedBody.data })
    } catch (error) {
      return next(error)
    }
  },
)

/** Recent saved forecast runs, newest first (server-side history). */
profileRouter.get('/runs', requireAuth, vendorRateLimit, async (req, res, next) => {
  const parsedLimit = z.coerce
    .number()
    .int()
    .min(1)
    .max(30)
    .safeParse(req.query.limit)

  try {
    let runs
    try {
      runs = await getRecentRuns(req.vendorId, parsedLimit.success ? parsedLimit.data : 5)
    } catch {
      // History read failure must not 500 the UI - degrade to empty.
      runs = []
    }
    return res.json({ runs })
  } catch (error) {
    return next(error)
  }
})
