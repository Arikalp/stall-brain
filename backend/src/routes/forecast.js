import { randomUUID } from 'node:crypto'
import { Router } from 'express'
import { z } from 'zod'
import { Command } from '@langchain/langgraph'
import { requireAuth } from '../middleware/auth.js'
import { vendorRateLimit } from '../middleware/rateLimit.js'
import { ForecastRequestSchema } from '../schemas.js'
import { getForecastGraph } from '../graph/build.js'
import { buildRunTraceConfig } from '../utils/tracing.js'

export const forecastRouter = Router()

/** Human-readable step label per graph node (T1.10). */
const NODE_STEPS = {
  loadContext: 'Loading your stall context...',
  gatherSignals: 'Checking weather, events, festivals and cricket...',
  forecastDemand: 'Crunching demand numbers for your items...',
  planProcurement: 'Planning quantities...',
  validate: 'Validating the plan...',
  explain: 'Writing your summary (English + Hindi)...',
  humanApproval: 'Waiting for your approval...',
  save: 'Saving your plan...',
}

/** The interrupt, if the run paused at humanApproval. */
function extractInterrupt(finalState) {
  const interrupts = finalState?.__interrupt__
  if (!Array.isArray(interrupts) || interrupts.length === 0) return null
  return interrupts[interrupts.length - 1]
}

/** Shapes the invoke result for the frontend: pending approval or done. */
function buildResponse(finalState) {
  const pending = extractInterrupt(finalState)
  if (pending) {
    return {
      status: 'PENDING_APPROVAL',
      runId: finalState.runId,
      plan: pending.value.plan,
      trace: finalState.trace ?? [],
      nodeTimings: finalState.nodeTimings ?? [],
    }
  }
  const plan = finalState.approvedPlan ?? finalState.plan
  if (!plan) {
    return null
  }
  return {
    status: 'DONE',
    runId: finalState.runId,
    plan,
    simulation: Boolean(finalState.simulation),
    trace: finalState.trace ?? [],
    nodeTimings: finalState.nodeTimings ?? [],
  }
}

const ResumeRequestSchema = z.object({
  runId: z.string().min(1),
  approved: z.boolean(),
  // The vendor's edits; validated against ForecastResultSchema inside the
  // humanApproval node (normalizeLlmForecast + Zod).
  editedPlan: z.unknown().optional(),
})

/**
 * Runs the agent graph. The request body is validated at this boundary. When
 * the graph pauses at humanApproval the response is PENDING_APPROVAL; the
 * vendor then decides via POST /api/forecast/resume on the same runId/thread.
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

    const isSimulation = Boolean(parsedBody.data.simulation)
    const runId = isSimulation ? `sim-${randomUUID()}` : randomUUID()
    const graph = getForecastGraph()
    const runConfig = buildRunTraceConfig({
      runId,
      vendorId: req.vendorId,
      stallType: parsedBody.data.stall?.id,
      simulation: isSimulation,
    })

    try {
      const finalState = await graph.invoke(
        { vendorId: req.vendorId, runId, request: parsedBody.data },
        runConfig,
      )

      const response = buildResponse(finalState)
      if (!response) {
        return res.status(502).json({
          error: 'FORECAST_INVALID',
          message: 'The agent did not produce a validated plan.',
          runId,
        })
      }
      return res.json(response)
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

/**
 * Resumes an interrupted run: the vendor approved (optionally with edited
 * quantities) or rejected the plan. Rejections regenerate via the graph's
 * own routing (humanApproval -> planProcurement), up to 3 times.
 */
forecastRouter.post(
  '/forecast/resume',
  requireAuth,
  vendorRateLimit,
  async (req, res, next) => {
    const parsedBody = ResumeRequestSchema.safeParse(req.body)
    if (!parsedBody.success) {
      return res.status(400).json({
        error: 'VALIDATION_FAILED',
        message: 'Resume body must be { runId, approved, editedPlan? }.',
        details: parsedBody.error.flatten().fieldErrors,
      })
    }

    const { runId, approved, editedPlan } = parsedBody.data
    const graph = getForecastGraph()

    try {
      // Only the vendor who started the run may resume it.
      const snapshot = await graph.getState({ configurable: { thread_id: runId } })
      if (!snapshot?.values) {
        return res.status(404).json({
          error: 'RUN_NOT_FOUND',
          message: 'No pending forecast run with this id.',
        })
      }
      if (snapshot.values.vendorId !== req.vendorId) {
        return res.status(403).json({
          error: 'FORBIDDEN',
          message: 'This forecast run belongs to another vendor.',
        })
      }
      if (!extractInterrupt(snapshot.values)) {
        return res.status(409).json({
          error: 'NOT_PENDING',
          message: 'This run is not waiting for approval.',
        })
      }

      const resumeConfig = buildRunTraceConfig({
        runId,
        vendorId: req.vendorId,
        stallType: snapshot.values.profile?.stallType,
        retryCount: snapshot.values.retryCount ?? 0,
        simulation: Boolean(snapshot.values.simulation),
      })

      const finalState = await graph.invoke(
        new Command({ resume: { approved, editedPlan } }),
        resumeConfig,
      )

      const response = buildResponse(finalState)
      if (!response) {
        return res.status(502).json({
          error: 'FORECAST_INVALID',
          message: 'The agent did not produce a validated plan.',
          runId,
        })
      }
      return res.json(response)
    } catch (error) {
      return next(error)
    }
  },
)

/**
 * Streams agent progress to the UI over Server-Sent Events (T1.10):
 *   event: meta    { runId }
 *   event: step    { step }            human-readable progress lines
 *   event: pending { runId, plan }     the graph paused for vendor approval
 *   event: done    { runId, plan }     the run completed without approval
 *   event: error   { message }
 * The frontend consumes this with fetch + ReadableStream (EventSource cannot
 * send the Firebase auth header).
 */
forecastRouter.post(
  '/forecast/stream',
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

    const isSimulation = Boolean(parsedBody.data.simulation)
    const runId = isSimulation ? `sim-${randomUUID()}` : randomUUID()

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    })

    const send = (event, data) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    }

    let clientGone = false
    // Detect premature client disconnect. (req 'close' fires as soon as the
    // POST body is consumed, so watch the response instead.)
    res.on('close', () => {
      if (!res.writableEnded) clientGone = true
    })

    try {
      const graph = getForecastGraph()
      const streamConfig = buildRunTraceConfig({
        runId,
        vendorId: req.vendorId,
        stallType: parsedBody.data.stall?.id,
        simulation: isSimulation,
      })
      const stream = await graph.stream(
        { vendorId: req.vendorId, runId, request: parsedBody.data },
        {
          streamMode: ['updates', 'custom'],
          ...streamConfig,
        },
      )

      let pendingPlan = null

      for await (const chunk of stream) {
        if (clientGone) break
        const [mode, update] = chunk
        if (mode !== 'updates' || !update) continue

        for (const [node, value] of Object.entries(update)) {
          if (node === '__interrupt__') {
            const interrupt = Array.isArray(value) ? value[value.length - 1] : value
            pendingPlan = interrupt?.value?.plan ?? null
            send('pending', { runId, plan: pendingPlan })
            continue
          }
          send('step', { step: NODE_STEPS[node] ?? `Step: ${node}` })
          for (const line of value?.trace ?? []) {
            send('step', { step: line })
          }
        }
      }

      if (!clientGone) {
        if (pendingPlan) {
          // Approval flow continues over POST /api/forecast/resume.
        } else {
          // Completed without approval (defensive; humanApproval always pauses).
          const snapshot = await graph.getState({
            configurable: { thread_id: runId },
          })
          const plan = snapshot?.values?.approvedPlan ?? snapshot?.values?.plan
          if (plan) {
            send('done', {
              runId,
              plan,
              simulation: isSimulation,
              nodeTimings: snapshot?.values?.nodeTimings ?? [],
            })
          } else {
            send('error', { message: 'The run ended without a plan.' })
          }
        }
        send('end', { runId })
        res.end()
      }
    } catch (error) {
      if (!clientGone) {
        console.error('[forecast] stream failed:', error)
        send('error', {
          message:
            error instanceof z.ZodError
              ? 'The forecast response did not match the expected schema.'
              : error?.message ?? 'The run failed unexpectedly.',
        })
        res.end()
      }
    }
  },
)
