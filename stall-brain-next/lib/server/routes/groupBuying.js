import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth.js'
import { vendorRateLimit } from '../middleware/rateLimit.js'
import {
  getGroupDemand,
  getVendorProfile,
  recordGroupDemand,
  saveVendorProfile,
} from '../store/firestore.js'
import { todayIso } from '../utils/dates.js'

export const groupBuyingRouter = Router()

/** GET /api/group-buying?lane=Hazratganj — anonymized nearby vendor demand (T3.9). */
groupBuyingRouter.get(
  '/group-buying',
  requireAuth,
  vendorRateLimit,
  async (req, res, next) => {
    try {
      const { profile } = await getVendorProfile(req.vendorId)
      const lane =
        typeof req.query.lane === 'string' && req.query.lane.trim()
          ? req.query.lane.trim()
          : profile?.lane ?? 'Hazratganj'
      const date =
        typeof req.query.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)
          ? req.query.date
          : todayIso()

      const data = await getGroupDemand({
        lane,
        date,
        vendorId: req.vendorId,
      })
      return res.json(data)
    } catch (error) {
      return next(error)
    }
  },
)

const GroupOptInSchema = z.object({
  optIn: z.boolean(),
  lane: z.string().trim().min(1).max(60).default('Hazratganj'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  items: z
    .array(
      z.object({
        item: z.string().min(1),
        toBuy: z.coerce.number().nonnegative(),
        unit: z.string().min(1).default('units'),
      }),
    )
    .default([]),
})

/** POST /api/group-buying/opt-in — share/withdraw anonymized item demand with nearby vendors. */
groupBuyingRouter.post(
  '/group-buying/opt-in',
  requireAuth,
  vendorRateLimit,
  async (req, res, next) => {
    const parsed = GroupOptInSchema.safeParse(req.body ?? {})
    if (!parsed.success) {
      return res.status(400).json({
        error: 'VALIDATION_FAILED',
        message: 'Invalid group-buying payload.',
        details: parsed.error.flatten().fieldErrors,
      })
    }

    try {
      const date = parsed.data.date ?? todayIso()
      const { profile } = await getVendorProfile(req.vendorId)
      if (profile?.stallType) {
        await saveVendorProfile(req.vendorId, {
          ...profile,
          lane: parsed.data.lane,
          groupBuyingOptIn: parsed.data.optIn,
        })
      }

      await recordGroupDemand({
        vendorId: req.vendorId,
        lane: parsed.data.lane,
        date,
        items: parsed.data.items,
        optIn: parsed.data.optIn,
      })

      const snapshot = await getGroupDemand({
        lane: parsed.data.lane,
        date,
        vendorId: req.vendorId,
      })
      return res.json({ ok: true, ...snapshot })
    } catch (error) {
      return next(error)
    }
  },
)

