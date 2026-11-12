import 'dotenv/config'
import { Command } from '@langchain/langgraph'
import { getForecastGraph } from '../src/graph/build.js'

// Simulate a network failure for Open-Meteo only: every other fetch (none in
// this scenario) still goes through. Proves a failing tool degrades the run
// gracefully instead of crashing it.
const realFetch = globalThis.fetch
globalThis.fetch = async (url, ...args) => {
  if (String(url).includes('open-meteo')) {
    throw new Error('ECONNREFUSED (simulated weather outage)')
  }
  return realFetch(url, ...args)
}

const request = {
  stall: { id: 'chai', name: 'Chai Tapri', items: ['milk', 'tea leaves'] },
  items: ['milk', 'tea leaves'],
  inventory: { milk: { quantity: 0, unit: 'litres' } },
  dateLabel: '12 November 2026',
  dayName: 'Thursday',
  // No frontend fallback weather provided: the tool failure is the only source.
}

const graph = getForecastGraph()
const threadId = `smoke-degraded-${Date.now()}`
const pausedState = await graph.invoke(
  { vendorId: 'smoke-test', runId: threadId, request },
  { configurable: { thread_id: threadId } },
)

// Auto-approve so the run completes and the degraded plan is printed.
const finalState = await graph.invoke(
  new Command({ resume: { approved: true } }),
  { configurable: { thread_id: threadId } },
)

console.log('TRACE:')
for (const step of finalState.trace) console.log(` - ${step}`)
console.log('\nSIGNAL ERRORS:', finalState.signals.errors)
console.log('CONFIDENCE:', finalState.plan.confidenceLevel, '-', finalState.plan.confidenceReason)
