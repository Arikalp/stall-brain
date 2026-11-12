import { describe, expect, it } from 'vitest'
import {
  MAX_TOOL_CALLS,
  buildSelectionMessages,
  buildSignalsFromOutputs,
  executeToolCalls,
  gatherSignals,
  runToolSelection,
} from '../src/graph/nodes/gatherSignals.js'
import { getWeatherTool, fetchWeatherSignal } from '../src/tools/weather.js'
import { getFestivalsTool, getLocalEventsTool } from '../src/tools/events.js'
import { getCricketScheduleTool } from '../src/tools/cricket.js'
import { getMandiPricesTool } from '../src/tools/prices.js'
import { webSearchTool } from '../src/tools/search.js'

/** Fake LLM that "chooses" tools per turn, like the real one would. */
function fakeLlm(turns) {
  let turnIndex = 0
  return {
    bindTools: () => ({
      invoke: async (messages) => {
        const turn = turns[Math.min(turnIndex, turns.length - 1)]
        turnIndex += 1
        return {
          tool_calls: turn.calls ?? [],
          // Simulate the model seeing tool results before final answer.
          content: turn.content ?? '',
        }
      },
    }),
  }
}

const fakeTools = [
  {
    name: 'getWeather',
    invoke: async () =>
      JSON.stringify({ label: 'Clear & Sunny ☀️', footfallImpact: 1.2, recommendation: 'ok', temperature: 28 }),
  },
  {
    name: 'getFestivals',
    invoke: async () =>
      JSON.stringify({ festivals: [{ name: 'Diwali', date: '2026-11-08', expectedFootfall: 'high' }], weddingSeason: null }),
  },
  {
    name: 'getLocalEvents',
    invoke: async () => JSON.stringify({ events: [] }),
  },
  {
    name: 'getCricketSchedule',
    invoke: async () =>
      JSON.stringify({ matches: [{ teams: 'LSG vs CSK', venue: 'Ekana', startTime: '7:30 PM', expectedCrowd: 'high' }] }),
  },
  {
    name: 'getMandiPrices',
    invoke: async () => JSON.stringify({ prices: [{ item: 'aloo', pricePerUnit: 22, unit: 'kg', source: 'mock-mandi-fixture', isMock: true }] }),
  },
  {
    name: 'webSearch',
    invoke: async () => JSON.stringify({ available: false, results: [], note: 'not configured' }),
  },
]

function toolsByName() {
  return Object.fromEntries(fakeTools.map((selectedTool) => [selectedTool.name, selectedTool]))
}

describe('buildSelectionMessages', () => {
  it('mentions the stall type and items', () => {
    const messages = buildSelectionMessages({
      date: '2026-11-12',
      dayName: 'Thursday',
      stallType: 'flowers',
      stallLabel: 'Flower Vendor',
      items: ['roses', 'marigold'],
    })
    expect(messages[1].content).toContain('Flower Vendor')
    expect(messages[1].content).toContain('roses')
  })
})

describe('executeToolCalls', () => {
  it('runs independent calls in parallel and collects outputs', async () => {
    const { outputs, errors, toolMessages } = await executeToolCalls({
      calls: [
        { name: 'getWeather', args: {}, id: 'c1' },
        { name: 'getFestivals', args: {}, id: 'c2' },
      ],
      toolsByName: toolsByName(),
    })
    expect(outputs).toHaveLength(2)
    expect(errors).toEqual([])
    expect(toolMessages).toHaveLength(2)
  })

  it('records failing and unknown tools as errors, never throws', async () => {
    const failing = [{ name: 'getWeather', invoke: async () => { throw new Error('timeout') } }]
    const { errors, toolMessages, outputs } = await executeToolCalls({
      calls: [
        { name: 'getWeather', args: {}, id: 'c1' },
        { name: 'nope', args: {}, id: 'c2' },
      ],
      toolsByName: Object.fromEntries(failing.map((selectedTool) => [selectedTool.name, selectedTool])),
    })
    expect(outputs).toEqual([])
    expect(errors).toHaveLength(2)
    expect(errors[0]).toContain('timeout')
    expect(errors[1]).toContain('Unknown tool')
    expect(toolMessages.every((message) => message.role === 'tool')).toBe(true)
  })
})

describe('runToolSelection (bounded agentic loop)', () => {
  it('stops after the LLM stops requesting tools', async () => {
    const llm = fakeLlm([
      { calls: [{ name: 'getWeather', args: {}, id: '1' }] },
      { calls: [] },
    ])
    const run = await runToolSelection({
      llm,
      tools: fakeTools,
      messages: buildSelectionMessages({ date: '2026-11-12', dayName: 'Thursday', stallType: 'chai', stallLabel: 'Chai Tapri', items: ['milk'] }),
      state: {},
    })
    expect(run.totalCalls).toBe(1)
    expect(run.trace).toEqual(['Called: getWeather'])
  })

  it('never exceeds MAX_TOOL_CALLS across turns', async () => {
    const calls = Array.from({ length: 5 }, (_, i) => ({ name: 'getWeather', args: {}, id: String(i) }))
    const llm = fakeLlm([
      { calls },
      { calls },
      { calls },
    ])
    const run = await runToolSelection({
      llm,
      tools: fakeTools,
      messages: buildSelectionMessages({ date: '2026-11-12', dayName: 'Thursday', stallType: 'chai', stallLabel: 'x', items: [] }),
      state: {},
    })
    expect(run.totalCalls).toBeLessThanOrEqual(MAX_TOOL_CALLS)
  })
})

describe('buildSignalsFromOutputs', () => {
  it('maps every tool output into the signals shape', () => {
    const { signals, multiplier } = buildSignalsFromOutputs({
      outputs: [
        { name: 'getWeather', output: JSON.stringify({ label: 'Clear & Sunny ☀️', footfallImpact: 1.2 }) },
        { name: 'getFestivals', output: JSON.stringify({ festivals: [{ name: 'Diwali', expectedFootfall: 'high' }], weddingSeason: { name: 'Wedding Season (Peak)', date: '2026-11-12', expectedFootfall: 'medium' } }) },
        { name: 'getCricketSchedule', output: JSON.stringify({ matches: [{ teams: 'LSG vs CSK', venue: 'Ekana', startTime: '7:30 PM', expectedCrowd: 'high' }] }) },
        { name: 'getMandiPrices', output: JSON.stringify({ prices: [{ item: 'aloo', pricePerUnit: 22, unit: 'kg', source: 's', isMock: true }] }) },
        { name: 'getLocalEvents', output: JSON.stringify({ events: [{ name: 'Mela', expectedFootfall: 'medium' }] }) },
        { name: 'webSearch', output: JSON.stringify({ available: false, results: [], note: 'not configured' }) },
      ],
      errors: [],
      today: '2026-11-12',
      dayName: 'Thursday',
      request: {},
    })

    expect(signals.weather.footfallImpact).toBe(1.2)
    expect(signals.festivals.map((festival) => festival.name)).toContain('Wedding Season (Peak)')
    expect(signals.match.teams).toBe('LSG vs CSK')
    expect(signals.prices[0].item).toBe('aloo')
    expect(signals.social).toEqual([]) // unavailable search is informational
    expect(signals.errors).toEqual([]) // not configured ≠ failed tool
    // event factor from local events: medium -> 1.2; weekday Thursday -> 1.0
    expect(multiplier.event).toBe(1.2)
    expect(multiplier.weekday).toBe(1)
    expect(multiplier.combined).toBeCloseTo(1.44)
  })

  it('falls back to frontend weather when the tool failed, and records the error', () => {
    const { signals, multiplier } = buildSignalsFromOutputs({
      outputs: [],
      errors: ['getWeather: network down'],
      today: '2026-11-12',
      dayName: 'Monday',
      request: {
        weatherSignal: { label: 'Rain / Drizzle 🌧️', footfallImpact: 0.7, recommendation: 'x' },
        eventMultiplier: 1.1,
      },
    })
    expect(signals.weather.label).toContain('Rain')
    expect(signals.errors).toContain('getWeather: network down')
    expect(multiplier.weather).toBe(0.7)
    // server weekday pattern for Monday is 0.9
    expect(multiplier.weekday).toBe(0.9)
  })

  it('defaults to neutral factors with no signals at all', () => {
    const { signals, multiplier } = buildSignalsFromOutputs({
      outputs: [],
      errors: [],
      today: '2026-11-12',
      dayName: 'Thursday',
      request: {},
    })
    expect(signals.weather).toBeNull()
    expect(multiplier).toMatchObject({ weather: 1, event: 1, weekday: 1, combined: 1 })
  })
})

describe('gatherSignals node with fake LLM (stall-type tool choice)', () => {
  it('chai stall: weather-first selection shows in trace', async () => {
    const llm = fakeLlm([
      { calls: [{ name: 'getWeather', args: {}, id: '1' }, { name: 'getCricketSchedule', args: {}, id: '2' }] },
      { calls: [] },
    ])
    const update = await gatherSignals(
      {
        request: { dayName: 'Thursday' },
        profile: { stallType: 'chai', stallLabel: 'Chai Tapri' },
        sessionIngredients: ['milk', 'cups'],
      },
      { llm, tools: fakeTools },
    )
    expect(update.signals.weather.label).toContain('Clear')
    expect(update.signals.match.teams).toBe('LSG vs CSK')
    expect(update.signals.festivals).toEqual([])
    expect(update.trace.join(' | ')).toContain('Called: getWeather, getCricketSchedule')
  })

  it('flower stall: festival selection shows in trace (different tool choice)', async () => {
    const llm = fakeLlm([
      { calls: [{ name: 'getFestivals', args: {}, id: '1' }, { name: 'getWeather', args: {}, id: '2' }] },
      { calls: [] },
    ])
    const update = await gatherSignals(
      {
        request: { dayName: 'Thursday' },
        profile: { stallType: 'flowers', stallLabel: 'Flower Vendor' },
        sessionIngredients: ['roses', 'marigold'],
      },
      { llm, tools: fakeTools },
    )
    expect(update.signals.festivals.map((festival) => festival.name)).toContain('Diwali')
    expect(update.signals.match).toBeNull()
    expect(update.trace.join(' | ')).toContain('Called: getFestivals, getWeather')
  })
})

describe('real tool objects are wired correctly', () => {
  const allReal = [
    getWeatherTool,
    getFestivalsTool,
    getLocalEventsTool,
    getCricketScheduleTool,
    getMandiPricesTool,
    webSearchTool,
  ]

  it('exposes exactly the six planned tools with unique names', () => {
    const names = allReal.map((selectedTool) => selectedTool.name)
    expect(names).toEqual([
      'getWeather',
      'getFestivals',
      'getLocalEvents',
      'getCricketSchedule',
      'getMandiPrices',
      'webSearch',
    ])
    expect(new Set(names).size).toBe(6)
  })

  it('curated tools return parseable JSON with isMock flags where required', async () => {
    const cricket = JSON.parse(await getCricketScheduleTool.invoke({}))
    expect(cricket.isMock).toBe(true)
    const events = JSON.parse(await getLocalEventsTool.invoke({}))
    expect(Array.isArray(events.events)).toBe(true)
  })

  it('real weather fetch fails gracefully against an unreachable host', async () => {
    const badFetch = async () => { throw new Error('ECONNREFUSED') }
    await expect(fetchWeatherSignal({ fetchImpl: badFetch })).rejects.toThrow('ECONNREFUSED')
  })
})
