export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { Command } from '@langchain/langgraph'
import { requireAuth } from '@/lib/server/requireAuth'
import { checkRateLimit } from '@/lib/server/rateLimit'
import { getForecastGraph } from '@/lib/server/graph/build'
import { buildRunTraceConfig } from '@/lib/server/utils/tracing'

const ResumeRequestSchema = z.object({
  runId: z.string().min(1),
  approved: z.boolean(),
  editedPlan: z.unknown().optional(),
})

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
  const parsedBody = ResumeRequestSchema.safeParse(body)
  if (!parsedBody.success) {
    return NextResponse.json(
      {
        error: 'VALIDATION_FAILED',
        message: 'Resume body must be { runId, approved, editedPlan? }.',
        details: parsedBody.error.flatten().fieldErrors,
      },
      { status: 400 }
    )
  }

  const { runId, approved, editedPlan } = parsedBody.data
  const graph = getForecastGraph()

  try {
    const snapshot = await graph.getState({ configurable: { thread_id: runId } })
    if (!snapshot || !snapshot.next || snapshot.next.length === 0) {
      return NextResponse.json(
        {
          error: 'NOT_PENDING',
          message: 'This run is not waiting for approval.',
        },
        { status: 409 }
      )
    }

    const resumeConfig = buildRunTraceConfig({
      runId,
      vendorId,
      stallType: snapshot.values?.profile?.stallType,
      retryCount: snapshot.values?.retryCount ?? 0,
      simulation: Boolean(snapshot.values?.simulation),
    })

    const finalState = await graph.invoke(
      new Command({ resume: { approved, editedPlan } }),
      resumeConfig,
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
    console.error('[forecast/resume] error:', err?.message)
    return NextResponse.json({ error: 'INTERNAL_ERROR', message: err?.message, runId }, { status: 500 })
  }
}
