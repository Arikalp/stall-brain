import { describe, expect, it } from 'vitest'
import { Command } from '@langchain/langgraph'
import { buildForecastGraph } from '../src/graph/build.js'
import { describeEdits, humanApproval } from '../src/graph/nodes/humanApproval.js'

const request = {
  stall: { id: 'chaat', name: 'Chaat Stall', items: ['aloo'] },
  items: ['aloo'],
  inventory: { aloo: { quantity: 4, unit: 'kg' } },
  dateLabel: '12 November 2026',
  dayName: 'Thursday',
  weatherSignal: { label: 'Clear & Sunny ☀️', footfallImpact: 1.2, recommendation: '' },
  weeklyMultiplier: 1,
  eventMultiplier: 1,
  demandMultiplier: 1.2,
}

const plannerPlan = {
  summary: 'plan',
  hindiSummary: 'योजना',
  expectedCustomers: 180,
  peakHours: '12-2pm',
  confidenceLevel: 'Medium',
  confidenceReason: 'ok',
  procurementList: [
    { item: 'aloo', totalNeeded: '14.4 kg', alreadyHave: '4 kg', toBuy: '10.4 kg', unit: 'kg', priority: 'essential' },
  ],
  sufficientStockItems: [],
  specialAdvice: 'a || ए',
}

/** Deterministic fake planner (no LLM key needed). */
const fakePlanner = async (state) => ({
  plan: {
    ...plannerPlan,
    summary: (state.approvalRejections ?? 0) > 0 ? 'regenerated' : 'plan',
  },
  trace: ['fake planner'],
})

/** Real nodes around the approval boundary. */
const realSupportNodes = {
  planProcurement: fakePlanner,
  gatherSignals: async (state) => ({
    signals: { weather: null, events: [], festivals: [], match: null, prices: [], social: [], errors: [] },
    multiplier: { weather: 1, event: 1, weekday: 1, festival: 1, match: 1, combined: 1 },
    trace: ['fake signals'],
  }),
  explain: async (state) => ({ trace: ['fake explain'] }),
  loadContext: async (state) => ({
    profile: { stallType: 'chaat', stallLabel: 'Chaat Stall' },
    sessionIngredients: state.request.items,
    inventory: state.request.inventory,
    date: '2026-11-12',
    history: [],
    bias: {},
    trace: ['fake context'],
  }),
  forecastDemand: async () => ({
    baseline: {},
    draftPlan: { items: [], sufficientStockItems: [] },
    trace: ['fake draft'],
  }),
  validate: async () => ({ validationErrors: [], trace: ['fake validator'] }),
  save: async (state) => ({ trace: [`fake save (${state.approvedPlan ? 'approved' : 'unapproved'})`] }),
}

function buildGraph() {
  return buildForecastGraph(realSupportNodes)
}

describe('human approval (T1.8): interrupt + resume', () => {
  it('pauses with the plan, then saves the approved plan', async () => {
    const graph = buildGraph()

    const paused = await graph.invoke(
      { vendorId: 'v1', runId: 'r1', request },
      { configurable: { thread_id: 'r1' } },
    )

    expect(paused.__interrupt__).toHaveLength(1)
    expect(paused.__interrupt__[0].value.plan.summary).toBe('plan')
    expect(paused.approvedPlan).toBeUndefined()

    const resumed = await graph.invoke(
      new Command({ resume: { approved: true } }),
      { configurable: { thread_id: 'r1' } },
    )

    expect(resumed.__interrupt__).toBeUndefined()
    expect(resumed.approvedPlan.summary).toBe('plan')
    expect(resumed.trace.join(' | ')).toContain('approved the plan as-is')
    expect(resumed.trace.join(' | ')).toContain('fake save (approved)')
  })

  it('an edited plan is what gets saved, with edits recorded', async () => {
    const graph = buildGraph()

    await graph.invoke(
      { vendorId: 'v1', runId: 'r2', request },
      { configurable: { thread_id: 'r2' } },
    )

    const editedPlan = {
      ...plannerPlan,
      procurementList: [
        { ...plannerPlan.procurementList[0], toBuy: '8 kg' },
      ],
    }

    const resumed = await graph.invoke(
      new Command({ resume: { approved: true, editedPlan } }),
      { configurable: { thread_id: 'r2' } },
    )

    expect(resumed.approvedPlan.procurementList[0].toBuy).toBe('8 kg')
    expect(resumed.approvedEdits).toEqual([
      { item: 'aloo', field: 'toBuy', from: '10.4 kg', to: '8 kg' },
    ])
  })

  it('a rejected plan regenerates and comes back for approval', async () => {
    const graph = buildGraph()

    await graph.invoke(
      { vendorId: 'v1', runId: 'r3', request },
      { configurable: { thread_id: 'r3' } },
    )

    const regenerated = await graph.invoke(
      new Command({ resume: { approved: false } }),
      { configurable: { thread_id: 'r3' } },
    )

    // Loop: reject -> planner -> validate -> explain -> approval interrupt again.
    expect(regenerated.__interrupt__).toHaveLength(1)
    expect(regenerated.__interrupt__[0].value.plan.summary).toBe('regenerated')
    expect(regenerated.approvalRejections).toBe(1)
  })

  it('after 3 rejections the current plan is saved anyway', async () => {
    const graph = buildGraph()
    await graph.invoke(
      { vendorId: 'v1', runId: 'r4', request },
      { configurable: { thread_id: 'r4' } },
    )

    let state = await graph.invoke(
      new Command({ resume: { approved: false } }),
      { configurable: { thread_id: 'r4' } },
    )
    state = await graph.invoke(
      new Command({ resume: { approved: false } }),
      { configurable: { thread_id: 'r4' } },
    )
    state = await graph.invoke(
      new Command({ resume: { approved: false } }),
      { configurable: { thread_id: 'r4' } },
    )

    expect(state.approvalRejections).toBe(3)
    expect(state.__interrupt__).toBeUndefined()
    // Saved anyway, but approvedPlan stays null (the plan was never accepted).
    expect(state.approvedPlan).toBeNull()
    expect(state.trace.join(' | ')).toContain('fake save (unapproved)')
  })

  it('invalid vendor edits fall back to the original plan', async () => {
    const graph = buildGraph()
    await graph.invoke(
      { vendorId: 'v1', runId: 'r5', request },
      { configurable: { thread_id: 'r5' } },
    )

    const resumed = await graph.invoke(
      new Command({ resume: { approved: true, editedPlan: { broken: true } } }),
      { configurable: { thread_id: 'r5' } },
    )

    expect(resumed.approvedPlan.procurementList[0].toBuy).toBe('10.4 kg')
    expect(resumed.trace.join(' | ')).toContain('failed validation')
  })
})

describe('describeEdits', () => {
  it('reports only changed toBuy values', () => {
    const original = { procurementList: [{ item: 'aloo', toBuy: '10.4 kg' }] }
    const approved = { procurementList: [{ item: 'Aloo ', toBuy: '9 kg' }] }
    expect(describeEdits(original, approved)).toEqual([
      { item: 'Aloo', field: 'toBuy', from: '10.4 kg', to: '9 kg' },
    ])
  })

  it('flags added items', () => {
    const original = { procurementList: [] }
    const approved = { procurementList: [{ item: 'puri', toBuy: '360 pieces' }] }
    expect(describeEdits(original, approved)).toEqual([
      { item: 'puri', field: 'toBuy', from: null, to: '360 pieces' },
    ])
  })

  it('reports nothing when the plan is unchanged', () => {
    const plan = { procurementList: [{ item: 'aloo', toBuy: '10.4 kg' }] }
    expect(describeEdits(plan, plan)).toEqual([])
  })
})
