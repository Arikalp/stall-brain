import 'dotenv/config'
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

const graph = getForecastGraph()
const finalState = await graph.invoke(
  { vendorId: 'smoke-test', runId: `smoke-${scenario}`, request },
  { configurable: { thread_id: `smoke-${scenario}` } },
)

console.log('TRACE:')
for (const step of finalState.trace) console.log(` - ${step}`)
console.log('\nSIGNALS:', JSON.stringify(finalState.signals, null, 2))
console.log('\nPLAN:', JSON.stringify(finalState.plan, null, 2))
