import 'dotenv/config'
import { Command } from '@langchain/langgraph'
import { getForecastGraph } from '../src/graph/build.js'

function buildRequest(id, name, items, inventory) {
  return {
    stall: { id, name, items },
    items,
    inventory,
    dateLabel: '12 November 2026',
    dayName: 'Thursday',
  }
}

const scenario = process.argv[2] ?? 'chaat'
// Second arg: 'approve' (default) | 'reject' | 'edit'
const mode = process.argv[3] ?? 'approve'

const scenarios = {
  chaat: buildRequest(
    'chaat',
    'Chaat Stall',
    ['aloo', 'puri', 'imli chutney'],
    { aloo: { quantity: 4, unit: 'kg' } },
  ),
  chai: buildRequest(
    'chai',
    'Chai Tapri',
    ['milk', 'tea leaves', 'cups'],
    { milk: { quantity: 0, unit: 'litres' } },
  ),
}

const request = scenarios[scenario] ?? scenarios.chaat
const threadId = `smoke-${scenario}-${Date.now()}`

const graph = getForecastGraph()

// --- Round 1: run until the vendor-approval interrupt (T1.8) ---
const pausedState = await graph.invoke(
  { vendorId: 'smoke-test', runId: threadId, request },
  { configurable: { thread_id: threadId } },
)

const interrupts = pausedState.__interrupt__ ?? []
if (!interrupts.length) {
  console.error('Expected the graph to pause at humanApproval, but it completed:', {
    hasPlan: Boolean(pausedState.plan),
    approvedPlan: Boolean(pausedState.approvedPlan),
  })
  process.exit(1)
}

console.log('=== PAUSED FOR APPROVAL ===')
console.log('TRACE:')
for (const step of pausedState.trace ?? []) console.log(` - ${step}`)
console.log('\nPROPOSED PLAN:', JSON.stringify(interrupts[0].value.plan, null, 2))

// --- Round 2: vendor decision, resumed on the same thread ---
let resume
if (mode === 'reject') {
  resume = { approved: false }
} else if (mode === 'edit') {
  const plan = interrupts[0].value.plan
  const edited = structuredClone(plan)
  for (const item of edited.procurementList ?? []) {
    const match = String(item.toBuy).match(/^([\d.]+)\s*(.*)$/)
    if (match) item.toBuy = `${Math.max(1, Math.round(Number(match[1]) / 2))} ${match[2]}`
  }
  resume = { approved: true, editedPlan: edited }
} else {
  resume = { approved: true }
}

const finalState = await graph.invoke(new Command({ resume }), {
  configurable: { thread_id: threadId },
})

console.log(`\n=== AFTER RESUME (${mode}) ===`)
if ((finalState.__interrupt__ ?? []).length) {
  console.log('Paused again for approval (regenerated plan):')
  console.log(JSON.stringify(finalState.__interrupt__[0].value.plan, null, 2))
  console.log('approvalRejections:', finalState.approvalRejections)
} else {
  console.log('TRACE:')
  for (const step of finalState.trace ?? []) console.log(` - ${step}`)
  console.log('\nSAVED PLAN:', JSON.stringify(finalState.approvedPlan ?? finalState.plan, null, 2))
  console.log('\nAPPROVED EDITS:', JSON.stringify(finalState.approvedEdits ?? [], null, 2))
}
