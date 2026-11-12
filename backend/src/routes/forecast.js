import { randomUUID } from 'node:crypto'
import { Router } from 'express'
import { ZodError } from 'zod'
import { requireAuth } from '../middleware/auth.js'
import { vendorRateLimit } from '../middleware/rateLimit.js'
import { ForecastRequestSchema } from '../schemas.js'
import { getForecastGraph } from '../graph/build.js'

export const forecastRouter = Router()

/**
 * Runs the agent graph. The request body is validated at this boundary, mapped
 * into graph state, and the graph produces the validated plan. runId doubles as
 * the checkpointer thread_id.
 */
forecastRouter.post(
  '/forecast',
  requireAuth,
  vendorRateLimit,
  async (req, res, next) => {
    const parsedBody = ForecastRequestSchema.safeParse(req.body)

    if (!parsedBody.success) {
      return res.status(400).json({
        error: 'VALIDATION_FAILED',
        message: 'Forecast request body failed validation.',
        details: parsedBody.error.flatten().fieldErrors,
      })
    }

    const runId = randomUUID()
    const graph = getForecastGraph()

    try {
      const finalState = await graph.invoke(
        {
          vendorId: req.vendorId,
          runId,
          request: parsedBody.data,
        },
        { configurable: { thread_id: runId } },
      )

      if (!finalState.plan) {
        return res.status(502).json({
          error: 'FORECAST_INVALID',
          message: 'The agent did not produce a validated plan.',
          runId,
        })
      }

      return res.json(finalState.plan)
    } catch (error) {
      if (error instanceof ZodError) {
        console.error('[forecast] LLM output failed schema validation:', {
          issues: error.issues,
        })
        return res.status(502).json({
          error: 'FORECAST_INVALID',
          message: 'The forecast response did not match the expected schema.',
          runId,
        })
      }
      return next(error)
    }
  },
)
