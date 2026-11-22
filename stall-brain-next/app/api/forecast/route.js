export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { ZodError } from 'zod'
import { requireAuth } from '@/lib/server/requireAuth'
import { checkRateLimit } from '@/lib/server/rateLimit'
import { ForecastRequestSchema } from '@/lib/server/schemas'
import { getForecastGraph } from '@/lib/server/graph/build'
import { buildRunTraceConfig } from '@/lib/server/utils/tracing'

function extractInterrupt(finalState) {
  const interrupts = finalState?.__interrupt__
  if (!Array.isArray(interrupts) || interrupts.length === 0) return null
  return interrupts[interrupts.length - 1]
}

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
  if (!plan) return null
  return {
    status: 'DONE',
    runId: finalState.runId,
    plan,
    simulation: Boolean(finalState.simulation),
    trace: finalState.trace ?? [],
    nodeTimings: finalState.nodeTimings ?? [],
  }
}

export async function POST(request) {
  const { vendorId, error, status } = await requireAuth(request)
  if (error) {
    return NextResponse.json({ error: 'AUTH_REQUIRED', message: error }, { status })
  }

  const { limited } = checkRateLimit(vendorId)
  if (limited) {
    return NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 })
  }

  const body = await request.json().catch(() => null)
  const parsedBody = ForecastRequestSchema.safeParse(body)
  if (!parsedBody.success) {
    return NextResponse.json(
      {
        error: 'VALIDATION_FAILED',
        message: 'Forecast request body failed validation.',
        details: parsedBody.error.flatten().fieldErrors,
      },
      { status: 400 }
    )
  }

  const isSimulation = Boolean(parsedBody.data.simulation)
  const runId = isSimulation ? `sim-${randomUUID()}` : randomUUID()
  const graph = getForecastGraph()
  const runConfig = buildRunTraceConfig({
    runId,
    vendorId,
    stallType: parsedBody.data.stall?.id,
    simulation: isSimulation,
  })

  try {
    const finalState = await graph.invoke(
      { vendorId, runId, request: parsedBody.data },
      runConfig,
    )

    const response = buildResponse(finalState)
    if (!response) {
      return NextResponse.json(
        {
          error: 'FORECAST_INVALID',
          message: 'The agent did not produce a validated plan.',
          runId,
        },
        { status: 502 }
      )
    }
    return NextResponse.json(response)
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json(
        {
          error: 'FORECAST_INVALID',
          message: 'The forecast response did not match the expected schema.',
          runId,
        },
        { status: 502 }
      )
    }
    console.error('[forecast] error:', err)
    return NextResponse.json({ error: 'INTERNAL_ERROR', message: err?.message, runId }, { status: 500 })
  }
}
