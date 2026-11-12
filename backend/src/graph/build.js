import { StateGraph, END, START, MemorySaver } from '@langchain/langgraph'
import { AgentState } from './state.js'
import { loadContext } from './nodes/loadContext.js'
import { gatherSignals } from './nodes/gatherSignals.js'
import { forecastDemand } from './nodes/forecast.js'
import { planProcurement } from './nodes/plan.js'
import { MAX_PLAN_RETRIES, validate } from './nodes/validate.js'
import { explain } from './nodes/explain.js'
import { humanApproval } from './nodes/humanApproval.js'
import { save } from './nodes/save.js'
import { config } from '../config.js'
import { getDb } from '../store/firestore.js'
import { createCheckpointer } from '../store/firestoreCheckpointer.js'

export { MAX_PLAN_RETRIES }

/** How many times the vendor may reject and regenerate before we save anyway. */
export const MAX_APPROVAL_REJECTIONS = 3

/**
 * Routing after validate: retry the planner while there are errors and
 * retries remain; otherwise continue to explain.
 */
export function routeAfterValidate(state) {
  const hasErrors = (state.validationErrors?.length ?? 0) > 0
  const canRetry = (state.retryCount ?? 0) < MAX_PLAN_RETRIES
  return hasErrors && canRetry ? 'planProcurement' : 'explain'
}

/**
 * Routing after humanApproval: save an approved plan; a rejection loops back
 * to the planner for a regeneration, up to MAX_APPROVAL_REJECTIONS times,
 * after which the current plan is saved with a note.
 */
export function routeAfterApproval(state) {
  if (state.approvedPlan) return 'save'
  if ((state.approvalRejections ?? 0) < MAX_APPROVAL_REJECTIONS) {
    return 'planProcurement'
  }
  return 'save'
}

/** Wraps a graph node to record per-node execution duration in state.nodeTimings (T4.2). */
export function wrapNodeWithTiming(nodeName, fn) {
  return async (state, config) => {
    const start = Date.now()
    const update = await fn(state, config)
    const durationMs = Math.max(0, Date.now() - start)
    return {
      ...(update ?? {}),
      nodeTimings: [{ node: nodeName, durationMs }],
    }
  }
}

/**
 * Builds the forecast agent graph. Compiled with a checkpointer so runs are
 * resumable by runId/thread_id. `nodeOverrides` lets tests swap in fake nodes
 * (e.g. a stubbed planner that needs no LLM key).
 */
export function buildForecastGraph(nodeOverrides = {}, { checkpointer } = {}) {
  const rawNodes = {
    loadContext,
    gatherSignals,
    forecastDemand,
    planProcurement,
    validate,
    explain,
    humanApproval,
    save,
    ...nodeOverrides,
  }
  const nodes = Object.fromEntries(
    Object.entries(rawNodes).map(([name, fn]) => [name, wrapNodeWithTiming(name, fn)]),
  )

  const workflow = new StateGraph(AgentState)
    .addNode('loadContext', nodes.loadContext)
    .addNode('gatherSignals', nodes.gatherSignals)
    .addNode('forecastDemand', nodes.forecastDemand)
    .addNode('planProcurement', nodes.planProcurement)
    .addNode('validate', nodes.validate)
    .addNode('explain', nodes.explain)
    .addNode('humanApproval', nodes.humanApproval)
    .addNode('save', nodes.save)
    .addEdge(START, 'loadContext')
    .addEdge('loadContext', 'gatherSignals')
    .addEdge('gatherSignals', 'forecastDemand')
    .addEdge('forecastDemand', 'planProcurement')
    .addEdge('planProcurement', 'validate')
    .addConditionalEdges(
      'validate',
      routeAfterValidate,
      ['planProcurement', 'explain'],
    )
    .addEdge('explain', 'humanApproval')
    .addConditionalEdges(
      'humanApproval',
      routeAfterApproval,
      ['save', 'planProcurement'],
    )
    .addEdge('save', END)

  return workflow.compile({
    checkpointer: checkpointer ?? new MemorySaver(),
  })
}

let cachedGraph

export function getForecastGraph() {
  if (cachedGraph) return cachedGraph
  // MemorySaver in dev; the Firestore-backed saver in prod so pending vendor
  // approvals survive a server restart (T1.9).
  const checkpointer = createCheckpointer(config, {
    db: config.checkpointBackend === 'firestore' ? getDb() : undefined,
  })
  cachedGraph = buildForecastGraph({}, { checkpointer })
  return cachedGraph
}
