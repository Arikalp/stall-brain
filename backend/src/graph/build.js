import { StateGraph, END, START, MemorySaver } from '@langchain/langgraph'
import { AgentState } from './state.js'
import { loadContext } from './nodes/loadContext.js'
import { gatherSignals } from './nodes/gatherSignals.js'
import { forecastDemand } from './nodes/forecast.js'
import { planProcurement } from './nodes/plan.js'
import { MAX_PLAN_RETRIES } from './nodes/validate.js'
import { validate } from './nodes/validate.js'
import { explain } from './nodes/explain.js'

export { MAX_PLAN_RETRIES }

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
 * Builds the forecast agent graph. Compiled with a checkpointer so runs are
 * resumable by runId/thread_id (T1.8, T1.9). `nodeOverrides` lets tests swap
 * in fake nodes (e.g. a stubbed planner that needs no LLM key).
 */
export function buildForecastGraph(nodeOverrides = {}, { checkpointer } = {}) {
  const nodes = {
    loadContext,
    gatherSignals,
    forecastDemand,
    planProcurement,
    validate,
    explain,
    ...nodeOverrides,
  }

  const workflow = new StateGraph(AgentState)
    .addNode('loadContext', nodes.loadContext)
    .addNode('gatherSignals', nodes.gatherSignals)
    .addNode('forecastDemand', nodes.forecastDemand)
    .addNode('planProcurement', nodes.planProcurement)
    .addNode('validate', nodes.validate)
    .addNode('explain', nodes.explain)
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
    .addEdge('explain', END)

  return workflow.compile({
    checkpointer: checkpointer ?? new MemorySaver(),
  })
}

let cachedGraph

export function getForecastGraph() {
  if (cachedGraph) return cachedGraph
  cachedGraph = buildForecastGraph()
  return cachedGraph
}
