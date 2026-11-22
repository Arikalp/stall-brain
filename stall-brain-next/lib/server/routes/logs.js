import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth.js'
import { vendorRateLimit } from '../middleware/rateLimit.js'
import { DailyLogSchema } from '../schemas.js'
import { getRecentLogs, saveDailyLog } from '../store/firestore.js'
import { updateBiasFromLog } from '../learning/bias.js'

export const logsRouter = Router()

/**
 * Request body for POST /api/logs: DailyLogSchema minus vendorId (which comes
 * from the verified auth token, never the client) and createdAt (server-set).
 */
const LogRequestSchema = DailyLogSchema.omit({ vendorId: true, createdAt: true })

/**
 * End-of-day sales log (T2.1/T2.2): the vendor reports what actually happened
 * per item. Persisted at vendors/{vendorId}/logs/{date} - the feedback loop's
 * data source for bias correction (T2.3).
 */
logsRouter.post(
  '/logs',
  requireAuth,
  vendorRateLimit,
  async (req, res, next) => {
    const parsedBody = LogRequestSchema.safeParse(req.body)
    if (!parsedBody.success) {
      return res.status(400).json({
        error: 'VALIDATION_FAILED',
        message: 'Log body must be { date, items: [{ item, outcome, ... }], customers? }.',
        details: parsedBody.error.flatten().fieldErrors,
      })
    }

    try {
      const result = await saveDailyLog(req.vendorId, parsedBody.data)
      if (!result.saved) {
        return res.status(503).json({
          error: 'SAVE_FAILED',
          message: 'Could not save your log right now. Please try again.',
          reason: result.reason,
        })
      }

      // T2.3: Update bias factors asynchronously — a bias-write failure must
      // never block the vendor's successful log confirmation.
      const biasResult = await updateBiasFromLog(
        req.vendorId,
        parsedBody.data.items,
        parsedBody.data.date,
      ).catch((error) => {
        console.warn('[logs] bias update failed (non-fatal):', error?.message ?? error)
        return { updated: [], skipped: [], biasExplanations: [] }
      })

      return res.json({
        saved: true,
        date: parsedBody.data.date,
        biasUpdated: biasResult.updated ?? [],
        biasExplanations: biasResult.biasExplanations ?? [],
      })
    } catch (error) {
      return next(error)
    }
  },
)

/**
 * Recent daily logs for the signed-in vendor (last `limit`, newest first).
 * Used by the UI to prefill/past days and by the vendor's history view.
 */
logsRouter.get(
  '/logs',
  requireAuth,
  vendorRateLimit,
  async (req, res, next) => {
    const parsedLimit = z.coerce
      .number()
      .int()
      .min(1)
      .max(100)
      .safeParse(req.query.limit)
    const limit = Math.min(parsedLimit.success ? parsedLimit.data : 14, 30)

    try {
      let logs
      try {
        logs = await getRecentLogs(req.vendorId, limit)
      } catch {
        // A history read failure must not 500 the UI - degrade to empty.
        logs = []
      }
      return res.json({ logs })
    } catch (error) {
      return next(error)
    }
  },
)
