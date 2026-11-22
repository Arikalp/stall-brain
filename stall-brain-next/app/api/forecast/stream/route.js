export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { requireAuth } from '@/lib/server/requireAuth'
import { checkRateLimit } from '@/lib/server/rateLimit'
import { ForecastRequestSchema } from '@/lib/server/schemas'
import { getForecastGraph } from '@/lib/server/graph/build'
import { buildRunTraceConfig } from '@/lib/server/utils/tracing'

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

  const encoder = new TextEncoder()
  const send = (controller, event, data) => {
    controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
  }

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const graph = getForecastGraph()
        const streamConfig = buildRunTraceConfig({
          runId,
          vendorId,
          stallType: parsedBody.data.stall?.id,
          simulation: isSimulation,
        })

        const graphStream = await graph.stream(
          { vendorId, runId, request: parsedBody.data },
          {
            streamMode: ['updates', 'custom'],
            ...streamConfig,
          },
        )

        let pendingPlan = null

        for await (const chunk of graphStream) {
          const [mode, update] = chunk
          if (mode !== 'updates' || !update) continue

          for (const [node, value] of Object.entries(update)) {
            if (node === '__interrupt__') {
              const interrupt = Array.isArray(value) ? value[value.length - 1] : value
              pendingPlan = interrupt?.value?.plan ?? null
              send(controller, 'pending', { runId, plan: pendingPlan })
              continue
            }
            send(controller, 'step', { step: NODE_STEPS[node] ?? `Step: ${node}` })
            for (const line of value?.trace ?? []) {
              send(controller, 'step', { step: line })
            }
          }
        }

        if (!pendingPlan) {
          const snapshot = await graph.getState({
            configurable: { thread_id: runId },
          })
          const plan = snapshot?.values?.approvedPlan ?? snapshot?.values?.plan
          if (plan) {
            send(controller, 'done', {
              runId,
              plan,
              simulation: isSimulation,
              nodeTimings: snapshot?.values?.nodeTimings ?? [],
            })
          } else {
            send(controller, 'error', { message: 'The run ended without a plan.' })
          }
        }

        send(controller, 'end', { runId })
        controller.close()
      } catch (err) {
        console.error('[forecast/stream] error:', err)
        send(controller, 'error', {
          message:
            err instanceof z.ZodError
              ? 'The forecast response did not match the expected schema.'
              : err?.message ?? 'The run failed unexpectedly.',
        })
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
