import { describe, expect, it, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import { Command } from '@langchain/langgraph'

// The graph is replaced with a fake so no LLM/Firestore is touched; behavior
// is scripted per test through graphState.
const graphState = vi.hoisted(() => ({
  invokeImpl: null,
  getStateImpl: null,
  streamImpl: null,
}))

vi.mock('../src/graph/build.js', () => ({
  getForecastGraph: () => ({
    invoke: (...args) => graphState.invokeImpl(...args),
    getState: (...args) => graphState.getStateImpl(...args),
    stream: (...args) => graphState.streamImpl(...args),
  }),
}))

// Auth + rate limit are pass-throughs; the vendor is fixed to 'vendor-1'.
vi.mock('../src/middleware/auth.js', () => ({
  requireAuth: (_req, _res, next) => {
    _req.vendorId = 'vendor-1'
    next()
  },
}))
vi.mock('../src/middleware/rateLimit.js', () => ({
  vendorRateLimit: (_req, _res, next) => next(),
}))

import { forecastRouter } from '../src/routes/forecast.js'

const validBody = {
  stall: { id: 'chaat', name: 'Chaat Stall', items: ['aloo'] },
  items: ['aloo'],
  inventory: { aloo: { quantity: 4, unit: 'kg' } },
  dateLabel: '12 November 2026',
  dayName: 'Thursday',
}

const plan = {
  summary: 'plan',
  hindiSummary: 'योजना',
  expectedCustomers: 100,
  peakHours: 'x',
  confidenceLevel: 'Medium',
  confidenceReason: 'ok',
  procurementList: [],
  sufficientStockItems: [],
  specialAdvice: 'a || ए',
}

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/', forecastRouter)
  return app
}

beforeEach(() => {
  graphState.invokeImpl = null
  graphState.getStateImpl = null
  graphState.streamImpl = null
})

describe('POST /api/forecast', () => {
  it('rejects an invalid body with 400 VALIDATION_FAILED', async () => {
    const res = await request(buildApp()).post('/forecast').send({})
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('VALIDATION_FAILED')
  })

  it('returns PENDING_APPROVAL with the plan when the graph pauses', async () => {
    graphState.invokeImpl = async (input, config) => {
      expect(config.configurable.thread_id).toBeTruthy()
      return {
        runId: 'run-1',
        trace: ['step a'],
        __interrupt__: [{ id: 'i1', value: { plan } }],
      }
    }

    const res = await request(buildApp()).post('/forecast').send(validBody)
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('PENDING_APPROVAL')
    expect(res.body.runId).toBe('run-1')
    expect(res.body.plan.expectedCustomers).toBe(100)
    expect(res.body.trace).toEqual(['step a'])
  })

  it('returns DONE with the approved plan when the graph completes', async () => {
    graphState.invokeImpl = async () => ({
      runId: 'run-2',
      trace: [],
      approvedPlan: plan,
    })

    const res = await request(buildApp()).post('/forecast').send(validBody)
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('DONE')
    expect(res.body.plan.summary).toBe('plan')
  })

  it('returns 502 FORECAST_INVALID when no plan was produced', async () => {
    graphState.invokeImpl = async () => ({ runId: 'run-3', trace: [] })

    const res = await request(buildApp()).post('/forecast').send(validBody)
    expect(res.status).toBe(502)
    expect(res.body.error).toBe('FORECAST_INVALID')
  })
})

describe('POST /api/forecast/resume', () => {
  const resumeBody = { runId: 'run-9', approved: true }

  it('rejects an invalid body with 400', async () => {
    const res = await request(buildApp()).post('/forecast/resume').send({})
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('VALIDATION_FAILED')
  })

  it('404s when the run does not exist', async () => {
    graphState.getStateImpl = async () => undefined

    const res = await request(buildApp()).post('/forecast/resume').send(resumeBody)
    expect(res.status).toBe(404)
    expect(res.body.error).toBe('RUN_NOT_FOUND')
  })

  it('403s when the run belongs to another vendor', async () => {
    graphState.getStateImpl = async () => ({ values: { vendorId: 'someone-else' } })

    const res = await request(buildApp()).post('/forecast/resume').send(resumeBody)
    expect(res.status).toBe(403)
    expect(res.body.error).toBe('FORBIDDEN')
  })

  it('409s when the run is not waiting for approval', async () => {
    graphState.getStateImpl = async () => ({ values: { vendorId: 'vendor-1' } })

    const res = await request(buildApp()).post('/forecast/resume').send(resumeBody)
    expect(res.status).toBe(409)
    expect(res.body.error).toBe('NOT_PENDING')
  })

  it('invokes the graph with Command({ resume }) and returns the result', async () => {
    graphState.getStateImpl = async () => ({
      values: { vendorId: 'vendor-1', __interrupt__: [{ id: 'i1', value: { plan } }] },
    })
    let seenInput
    graphState.invokeImpl = async (input) => {
      seenInput = input
      return { runId: 'run-9', trace: [], approvedPlan: plan }
    }

    const res = await request(buildApp()).post('/forecast/resume').send({
      runId: 'run-9',
      approved: true,
      editedPlan: plan,
    })
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('DONE')
    expect(seenInput).toBeInstanceOf(Command)
    expect(seenInput.resume).toEqual({ approved: true, editedPlan: plan })
  })
})

describe('POST /api/forecast/stream (SSE)', () => {
  it('streams step and pending events, then ends', async () => {
    graphState.streamImpl = async () => {
      const chunks = [
        ['updates', { loadContext: { trace: ['Loaded context'] } }],
        ['updates', { explain: { trace: ['Explained plan'] } }],
        ['updates', { __interrupt__: [{ id: 'i1', value: { plan } }] }],
      ]
      return (async function* generate() {
        for (const chunk of chunks) yield chunk
      })()
    }

    const res = await request(buildApp())
      .post('/forecast/stream')
      .send(validBody)

    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toContain('text/event-stream')

    const body = res.text
    expect(body).toContain('event: step')
    expect(body).toContain('Loading your stall context...')
    expect(body).toContain('Loaded context')
    expect(body).toContain('event: pending')
    expect(body).toContain('"expectedCustomers":100')
    expect(body).toContain('event: end')
    // No 'done' event: the run paused for approval instead.
    expect(body).not.toContain('event: done')
  })

  it('sends an error event when the stream throws', async () => {
    graphState.streamImpl = async () => {
      throw new Error('boom')
    }

    const res = await request(buildApp()).post('/forecast/stream').send(validBody)
    expect(res.status).toBe(200)
    expect(res.text).toContain('event: error')
    expect(res.text).toContain('boom')
  })
})
