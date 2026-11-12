import { describe, expect, it, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

const storeState = vi.hoisted(() => ({
  saveDailyLogImpl: null,
  getRecentLogsImpl: null,
}))

vi.mock('../src/store/firestore.js', () => ({
  saveDailyLog: (...args) => storeState.saveDailyLogImpl(...args),
  getRecentLogs: (...args) => storeState.getRecentLogsImpl(...args),
}))

vi.mock('../src/middleware/auth.js', () => ({
  requireAuth: (_req, _res, next) => {
    _req.vendorId = 'vendor-1'
    next()
  },
}))
vi.mock('../src/middleware/rateLimit.js', () => ({
  vendorRateLimit: (_req, _res, next) => next(),
}))

import { logsRouter } from '../src/routes/logs.js'

const validLog = {
  date: '2026-11-12',
  items: [
    { item: 'aloo', outcome: 'sold_out' },
    { item: 'puri', outcome: 'leftover_medium', leftoverLevel: 'medium' },
  ],
  customers: 210,
}

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/', logsRouter)
  return app
}

beforeEach(() => {
  storeState.saveDailyLogImpl = null
  storeState.getRecentLogsImpl = null
})

describe('POST /api/logs (T2.1)', () => {
  it('rejects a missing date/items body with 400', async () => {
    const res = await request(buildApp()).post('/logs').send({})
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('VALIDATION_FAILED')
  })

  it('rejects an unknown outcome with 400', async () => {
    const res = await request(buildApp())
      .post('/logs')
      .send({ ...validLog, items: [{ item: 'aloo', outcome: 'superb' }] })
    expect(res.status).toBe(400)
  })

  it('saves the log and reports the date', async () => {
    let seenArgs
    storeState.saveDailyLogImpl = async (vendorId, log) => {
      seenArgs = { vendorId, log }
      return { saved: true }
    }

    const res = await request(buildApp()).post('/logs').send(validLog)
    expect(res.status).toBe(200)
    expect(res.body.saved).toBe(true)
    expect(res.body.date).toBe('2026-11-12')
    expect(seenArgs.vendorId).toBe('vendor-1') // from auth, not the body
    expect(seenArgs.log.items[0].outcome).toBe('sold_out')
  })

  it('503s when the store cannot save (vendor can retry)', async () => {
    storeState.saveDailyLogImpl = async () => ({
      saved: false,
      reason: 'Firestore save failed: offline',
    })

    const res = await request(buildApp()).post('/logs').send(validLog)
    expect(res.status).toBe(503)
    expect(res.body.error).toBe('SAVE_FAILED')
  })
})

describe('GET /api/logs (T2.1)', () => {
  it('returns recent logs for the vendor', async () => {
    let seenLimit
    storeState.getRecentLogsImpl = async (vendorId, limit) => {
      seenLimit = { vendorId, limit }
      return [{ date: '2026-11-11', items: [] }]
    }

    const res = await request(buildApp()).get('/logs?limit=5')
    expect(res.status).toBe(200)
    expect(res.body.logs).toHaveLength(1)
    expect(seenLimit).toEqual({ vendorId: 'vendor-1', limit: 5 })
  })

  it('falls back to the default limit for an out-of-range value', async () => {
    let seenLimit
    storeState.getRecentLogsImpl = async (_vendorId, limit) => {
      seenLimit = limit
      return []
    }

    await request(buildApp()).get('/logs?limit=9999')
    expect(seenLimit).toBe(14)
  })

  it('degrades to an empty list on store failure', async () => {
    storeState.getRecentLogsImpl = async () => {
      throw new Error('offline')
    }

    const res = await request(buildApp()).get('/logs')
    expect(res.status).toBe(200)
    expect(res.body.logs).toEqual([])
  })
})
