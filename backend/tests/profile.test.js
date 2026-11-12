import { describe, expect, it, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

const storeState = vi.hoisted(() => ({
  getVendorProfileImpl: null,
  saveVendorProfileImpl: null,
  getRecentRunsImpl: null,
}))

vi.mock('../src/store/firestore.js', () => ({
  getVendorProfile: (...args) => storeState.getVendorProfileImpl(...args),
  saveVendorProfile: (...args) => storeState.saveVendorProfileImpl(...args),
  getRecentRuns: (...args) => storeState.getRecentRunsImpl(...args),
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

import { profileRouter } from '../src/routes/profile.js'

const validProfile = {
  stallType: 'chaat',
  stallLabel: 'Chaat Stall',
  stallEmoji: '🥗',
  ingredients: ['aloo', 'puri'],
}

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/', profileRouter)
  return app
}

beforeEach(() => {
  storeState.getVendorProfileImpl = null
  storeState.saveVendorProfileImpl = null
  storeState.getRecentRunsImpl = null
})

describe('GET /api/profile (T2.2)', () => {
  it('returns the stored profile', async () => {
    storeState.getVendorProfileImpl = async (vendorId) => {
      expect(vendorId).toBe('vendor-1')
      return { profile: validProfile }
    }

    const res = await request(buildApp()).get('/profile')
    expect(res.status).toBe(200)
    expect(res.body.profile.stallType).toBe('chaat')
  })

  it('returns null profile for a new vendor', async () => {
    storeState.getVendorProfileImpl = async () => ({ profile: null })

    const res = await request(buildApp()).get('/profile')
    expect(res.status).toBe(200)
    expect(res.body.profile).toBeNull()
  })
})

describe('PUT /api/profile (T2.2)', () => {
  it('rejects an invalid profile with 400', async () => {
    const res = await request(buildApp()).put('/profile').send({ stallType: 'chaat' })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('VALIDATION_FAILED')
  })

  it('saves the profile and echoes it back', async () => {
    let seen
    storeState.saveVendorProfileImpl = async (vendorId, profile) => {
      seen = { vendorId, profile }
      return { saved: true }
    }

    const res = await request(buildApp()).put('/profile').send(validProfile)
    expect(res.status).toBe(200)
    expect(res.body.saved).toBe(true)
    expect(res.body.profile).toEqual(validProfile)
    expect(seen.vendorId).toBe('vendor-1')
  })

  it('503s when the store cannot save', async () => {
    storeState.saveVendorProfileImpl = async () => ({ saved: false, reason: 'offline' })

    const res = await request(buildApp()).put('/profile').send(validProfile)
    expect(res.status).toBe(503)
    expect(res.body.error).toBe('SAVE_FAILED')
  })
})

describe('GET /api/runs (T2.2)', () => {
  it('returns recent saved runs', async () => {
    storeState.getRecentRunsImpl = async (vendorId, limit) => {
      expect(vendorId).toBe('vendor-1')
      expect(limit).toBe(5)
      return [{ runId: 'r1', approvedPlan: { summary: 'x' } }]
    }

    const res = await request(buildApp()).get('/runs')
    expect(res.status).toBe(200)
    expect(res.body.runs).toHaveLength(1)
    expect(res.body.runs[0].runId).toBe('r1')
  })

  it('degrades to an empty list when history cannot be read', async () => {
    storeState.getRecentRunsImpl = async () => {
      throw new Error('offline')
    }

    const res = await request(buildApp()).get('/runs')
    expect(res.status).toBe(200)
    expect(res.body.runs).toEqual([])
  })
})
