import { describe, expect, it } from 'vitest'
import { Command } from '@langchain/langgraph'
import { buildForecastGraph } from '../src/graph/build.js'
import {
  FakeDbAdapter,
  FirestoreCheckpointSaver,
  InMemoryFirestore,
} from '../src/store/firestoreCheckpointer.js'
import {
  getRecentLogs,
  getRecentRuns,
  getVendorContext,
  getVendorProfile,
  saveDailyLog,
  saveRun,
  saveVendorProfile,
  setDb,
} from '../src/store/firestore.js'
describe('FirestoreCheckpointSaver (T1.9)', () => {
  const fakeDb = new FakeDbAdapter()

  const supportNodes = {
    loadContext: async (state) => ({
      profile: { stallType: 'chaat', stallLabel: 'Chaat Stall' },
      sessionIngredients: state.request.items,
      inventory: state.request.inventory,
      date: '2026-11-12',
      history: [],
      bias: {},
      trace: ['fake context'],
    }),
    gatherSignals: async () => ({
      signals: { weather: null, events: [], festivals: [], match: null, prices: [], social: [], errors: [] },
      multiplier: { weather: 1, event: 1, weekday: 1, festival: 1, match: 1, combined: 1 },
      trace: ['fake signals'],
    }),
    forecastDemand: async () => ({
      baseline: {},
      draftPlan: { items: [], sufficientStockItems: [] },
      trace: ['fake draft'],
    }),
    planProcurement: async () => ({
      plan: {
        summary: 'plan',
        hindiSummary: 'योजना',
        expectedCustomers: 100,
        peakHours: 'x',
        confidenceLevel: 'Medium',
        confidenceReason: 'ok',
        procurementList: [],
        sufficientStockItems: [],
        specialAdvice: 'a || ए',
      },
      trace: ['fake planner'],
    }),
    validate: async () => ({ validationErrors: [], trace: ['fake validator'] }),
    explain: async () => ({ trace: ['fake explain'] }),
    save: async (state) => ({ trace: [`fake save (${state.approvedPlan ? 'approved' : 'unapproved'})`] }),
  }

  it('put/getTuple round-trips a checkpoint through the fake Firestore', async () => {
    const saver = new FirestoreCheckpointSaver({ db: fakeDb })
    const config = { configurable: { thread_id: 't1' } }
    const checkpoint = {
      v: 4,
      id: 'cp-1',
      ts: new Date().toISOString(),
      channel_values: { plan: { item: 'aloo' } },
      channel_versions: { plan: 1 },
      versions_seen: {},
    }
    const metadata = { source: 'loop', step: 1 }

    await saver.put(config, checkpoint, metadata, {})
    const tuple = await saver.getTuple({ configurable: { thread_id: 't1' } })

    expect(tuple.checkpoint.id).toBe('cp-1')
    expect(tuple.checkpoint.channel_values.plan).toEqual({ item: 'aloo' })
    expect(tuple.metadata.source).toBe('loop')
  })

  it('putWrites round-trips pending writes', async () => {
    const saver = new FirestoreCheckpointSaver({ db: fakeDb })
    const config = { configurable: { thread_id: 't1', checkpoint_id: 'cp-1' } }
    await saver.putWrites(config, [['__interrupt__', { plan: { x: 1 } }]], 'task-1')

    const tuple = await saver.getTuple({ configurable: { thread_id: 't1' } })
    expect(tuple.pendingWrites).toEqual([
      ['task-1', '__interrupt__', { plan: { x: 1 } }],
    ])
  })

  it('deleteThread removes all checkpoints and writes', async () => {
    const saver = new FirestoreCheckpointSaver({ db: fakeDb })
    await saver.deleteThread('t1')
    const tuple = await saver.getTuple({ configurable: { thread_id: 't1' } })
    expect(tuple).toBeUndefined()
  })

  it('a pending approval survives a new saver instance (server restart)', async () => {
    const db = new FakeDbAdapter()
    const shared = { db }

    const support = {
      ...supportNodes,
      planProcurement: async () => ({
        plan: {
          summary: 'pending plan',
          hindiSummary: 'योजना',
          expectedCustomers: 100,
          peakHours: 'x',
          confidenceLevel: 'Medium',
          confidenceReason: 'ok',
          procurementList: [],
          sufficientStockItems: [],
          specialAdvice: 'a || ए',
        },
        trace: ['fake planner'],
      }),
    }

    const firstServer = buildForecastGraph(support, {
      checkpointer: new FirestoreCheckpointSaver(shared),
    })

    const paused = await firstServer.invoke(
      { vendorId: 'v1', runId: 'r9', request: { stall: { name: 'x' } } },
      { configurable: { thread_id: 'r9' } },
    )
    expect(paused.__interrupt__).toHaveLength(1)

    // "Restart": a brand new graph + saver instance over the same Firestore.
    const restartedServer = buildForecastGraph(support, {
      checkpointer: new FirestoreCheckpointSaver(shared),
    })

    const resumed = await restartedServer.invoke(
      new Command({ resume: { approved: true } }),
      { configurable: { thread_id: 'r9' } },
    )
    expect(resumed.approvedPlan.summary).toBe('pending plan')
    expect(resumed.trace.join(' | ')).toContain('fake save (approved)')
  })
})

describe('store/firestore (vendor context + runs)', () => {
  it('getVendorContext returns logs and bias factors', async () => {
    const db = {
      collection: (name) => ({
        doc: (id) => ({
          collection: (sub) => ({
            orderBy: () => ({
              limit: () => ({
                get: async () => ({
                  docs: [
                    { id: '2026-11-11', data: () => ({ items: [{ item: 'aloo', outcome: 'sold_out' }] }) },
                  ],
                }),
              }),
            }),
          }),
          get: async () => ({ exists: true, data: () => ({ biasFactors: { aloo: 0.8 } }) }),
        }),
      }),
    }

    const context = await getVendorContext('v1', { db })
    expect(context.history).toHaveLength(1)
    expect(context.history[0].items[0].outcome).toBe('sold_out')
    expect(context.bias.aloo).toBe(0.8)
  })

  it('getVendorContext degrades gracefully on failure', async () => {
    const context = await getVendorContext('v1', {
      db: {
        collection: () => {
          throw new Error('offline')
        },
      },
    })
    expect(context.history).toEqual([])
    expect(context.bias).toEqual({})
    expect(context.error).toContain('offline')
  })

  it('saveRun persists and reports failure gracefully', async () => {
    const fakeDb = new InMemoryFirestore()
    setDb(fakeDb) // exercise the default getDb() path via injection

    const ok = await saveRun('v1', { runId: 'r1', plan: { summary: 'x' } }, { db: fakeDb })
    expect(ok.saved).toBe(true)

    const failing = await saveRun('v1', { runId: 'r2' }, {
      db: {
        collection: () => {
          throw new Error('offline')
        },
      },
    })
    expect(failing.saved).toBe(false)
    expect(failing.reason).toContain('offline')

    const missing = await saveRun(null, { runId: 'r3' })
    expect(missing.saved).toBe(false)
  })
})

describe('store/firestore (T2.2: profile, logs, runs)', () => {
  it('saveDailyLog upserts and getRecentLogs reads newest first', async () => {
    const fakeDb = new InMemoryFirestore()

    const ok = await saveDailyLog('v1', { date: '2026-11-12', items: [{ item: 'aloo', outcome: 'sold_out' }] }, { db: fakeDb })
    expect(ok.saved).toBe(true)
    await saveDailyLog('v1', { date: '2026-11-13', items: [] }, { db: fakeDb })

    // Overwrite (upsert) the earlier date.
    await saveDailyLog('v1', { date: '2026-11-12', items: [{ item: 'puri', outcome: 'wasted' }] }, { db: fakeDb })

    const logs = await getRecentLogs('v1', 10, { db: fakeDb })
    expect(logs.map((log) => log.date)).toEqual(['2026-11-13', '2026-11-12'])
    expect(logs[1].items[0].outcome).toBe('wasted')

    const missing = await saveDailyLog(null, { date: 'x' })
    expect(missing.saved).toBe(false)
  })

  it('getRecentLogs degrades to [] on failure', async () => {
    const logs = await getRecentLogs('v1', 10, {
      db: {
        collection: () => {
          throw new Error('offline')
        },
      },
    })
    expect(logs).toEqual([])
  })

  it('saveVendorProfile merges into the vendor doc (keeps biasFactors)', async () => {
    const fakeDb = new InMemoryFirestore()
    // Seed biasFactors the way loadContext reads them.
    await fakeDb.collection('vendors').doc('v1').set({ biasFactors: { aloo: 0.8 } })

    const ok = await saveVendorProfile(
      'v1',
      { stallType: 'chaat', stallLabel: 'Chaat Stall', stallEmoji: '🥗', ingredients: ['aloo'] },
      { db: fakeDb },
    )
    expect(ok.saved).toBe(true)

    const snap = await fakeDb.collection('vendors').doc('v1').get()
    expect(snap.data().biasFactors.aloo).toBe(0.8) // not clobbered by the profile save
    expect(snap.data().profile.stallType).toBe('chaat')
  })

  it('getVendorProfile returns null for missing vendor and [] on failure paths', async () => {
    const fakeDb = new InMemoryFirestore()
    const none = await getVendorProfile('ghost', { db: fakeDb })
    expect(none.profile).toBeNull()

    const broken = await getVendorProfile('v1', {
      db: {
        collection: () => {
          throw new Error('offline')
        },
      },
    })
    expect(broken.profile).toBeNull()
    expect(broken.error).toContain('offline')
  })

  it('getRecentRuns returns saved runs newest first', async () => {
    const db = {
      collection: (name) => ({
        doc: (id) => ({
          collection: (sub) => ({
            orderBy: () => ({
              limit: () => ({
                get: async () => ({
                  docs: [
                    { id: 'r2', data: () => ({ date: '2026-11-13', approvedPlan: { summary: 'newer' } }) },
                    { id: 'r1', data: () => ({ date: '2026-11-12', approvedPlan: { summary: 'older' } }) },
                  ],
                }),
              }),
            }),
          }),
        }),
      }),
    }

    const runs = await getRecentRuns('v1', 5, { db })
    expect(runs.map((run) => run.runId)).toEqual(['r2', 'r1'])
    expect(runs[0].approvedPlan.summary).toBe('newer')
  })
})
