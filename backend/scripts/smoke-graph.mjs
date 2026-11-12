import 'dotenv/config'
import { getForecastGraph } from '../src/graph/build.js'

const request = {
  stall: { id: 'chaat', name: 'Chaat Stall', items: ['aloo', 'puri', 'imli chutney'] },
  items: ['aloo', 'puri', 'imli chutney'],
  inventory: { aloo: { quantity: 4, unit: 'kg' }, puri: { quantity: 0, unit: 'pieces' } },
  dateLabel: '12 November 2026',
  dayName: 'Thursday',
  weather: { temperature: 28 },
  weatherSignal: {
    label: 'Clear & Sunny ☀️',
    footfallImpact: 1.2,
    recommendation: 'Stock up, clear skies boost footfall.',
  },
  eventSummary: 'No special events reported today.',
  weeklyMultiplier: 1,
  eventMultiplier: 1,
  demandMultiplier: 1.2,
}

const graph = getForecastGraph()
const finalState = await graph.invoke(
  { vendorId: 'smoke-test', runId: 'smoke-1', request },
  { configurable: { thread_id: 'smoke-1' } },
)

console.log('TRACE:')
for (const step of finalState.trace) console.log(` - ${step}`)
console.log('\nPLAN:', JSON.stringify(finalState.plan, null, 2))
