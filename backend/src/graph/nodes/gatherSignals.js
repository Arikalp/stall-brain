import { getLlm } from '../../llm.js'
import { getWeatherTool } from '../../tools/weather.js'
import { getFestivalsTool, getLocalEventsTool } from '../../tools/events.js'
import { getCricketScheduleTool } from '../../tools/cricket.js'
import { getMandiPricesTool } from '../../tools/prices.js'
import { webSearchTool } from '../../tools/search.js'
import { eventImpact, weekdayPattern } from '../../data/baselines.js'
import { clampMultiplier } from './forecast.js'
import { dayNameFor, todayIso } from '../../utils/dates.js'

/**
 * Tool-using signal node (T1.3). The LLM chooses which tools to call based on
 * the stall type (chai: weather first; flowers: festivals first), tools run in
 * parallel per turn, and the loop is bounded (max 6 tool calls, 3 turns).
 *
 * Failure rule: a failing tool is recorded in signals.errors and the run
 * continues - never crash the forecast.
 */

export const MAX_TOOL_CALLS = 6
export const MAX_TOOL_ITERATIONS = 3

export const signalTools = [
  getWeatherTool,
  getFestivalsTool,
  getLocalEventsTool,
  getCricketScheduleTool,
  getMandiPricesTool,
  webSearchTool,
]

const SELECTION_PROMPT = `You gather market signals for a street vendor's daily procurement forecast in Hazratganj, Lucknow.

Choose which tools to call, guided by the stall type:
- Weather (getWeather): always call once. Rain kills chai/bhutta/juice footfall; heat drives juice demand.
- Festivals & weddings (getFestivals): call for flower stalls always (pooja + wedding demand), and for any stall when a festival may be near.
- Local events/melas (getLocalEvents): call for snacks, chaat, balloon/toy stalls, and whenever crowds gather.
- Cricket fixtures (getCricketSchedule): call for chai, snacks, chaat and balloon stalls on possible match days.
- Mandi prices (getMandiPrices): call when the vendor needs price context; pass their ingredient names.
- Web search (webSearch): at most once, and only if you need to check something unusual the other tools cannot answer.

Call several independent tools together in one turn when they apply. Do not call the same tool twice.`

/** Builds the LLM conversation that selects tools. Exported for tests. */
export function buildSelectionMessages({ date, dayName, stallType, stallLabel, items }) {
  return [
    { role: 'system', content: SELECTION_PROMPT },
    {
      role: 'user',
      content: `Date: ${date} (${dayName})
Stall: ${stallLabel} (type: ${stallType})
Vendor's items: ${items.join(', ')}
Which signals do you need? Call the relevant tools now.`,
    },
  ]
}

/** One turn: execute the LLM's requested tools in parallel. Returns outputs + errors. */
export async function executeToolCalls({ calls, toolsByName }) {
  const results = await Promise.allSettled(
    calls.map(async (call) => {
      const selectedTool = toolsByName[call.name]
      if (!selectedTool) {
        throw new Error(`Unknown tool "${call.name}"`)
      }
      const output = await selectedTool.invoke(call.args ?? {})
      return { call, output }
    }),
  )

  const toolMessages = []
  const outputs = []
  const errors = []

  for (let i = 0; i < calls.length; i += 1) {
    const result = results[i]
    const call = calls[i]
    if (result.status === 'fulfilled') {
      toolMessages.push({ role: 'tool', tool_call_id: call.id ?? call.name, content: String(result.value.output) })
      outputs.push({ name: call.name, output: result.value.output })
    } else {
      const reason = result.reason?.message ?? String(result.reason)
      errors.push(`${call.name}: ${reason}`)
      toolMessages.push({
        role: 'tool',
        tool_call_id: call.id ?? call.name,
        content: `TOOL FAILED: ${reason}`,
      })
    }
  }

  return { toolMessages, outputs, errors }
}

/** Runs the bounded tool-selection loop. Exported for tests. */
export async function runToolSelection({ llm, tools, messages, state }) {
  const toolsByName = Object.fromEntries(tools.map((selectedTool) => [selectedTool.name, selectedTool]))
  const llmWithTools = llm.bindTools(tools)

  const outputs = []
  const errors = []
  const trace = []
  const conversation = [...messages]
  let totalCalls = 0
  let turns = 0

  while (turns < MAX_TOOL_ITERATIONS && totalCalls < MAX_TOOL_CALLS) {
    turns += 1
    const response = await llmWithTools.invoke(conversation)
    const calls = response?.tool_calls ?? []

    if (calls.length === 0) break
    const bounded = calls.slice(0, MAX_TOOL_CALLS - totalCalls)
    totalCalls += bounded.length
    trace.push(`Called: ${bounded.map((call) => call.name).join(', ')}`)

    conversation.push(response)
    const turn = await executeToolCalls({ calls: bounded, toolsByName })
    outputs.push(...turn.outputs)
    errors.push(...turn.errors)
    conversation.push(...turn.toolMessages)
  }

  void state
  return { outputs, errors, trace, totalCalls, turns }
}

/** Maps tool outputs into the Signals + multiplier shape. Exported for tests. */
export function buildSignalsFromOutputs({ outputs, errors, today, dayName, request }) {
  const signals = {
    weather: null,
    events: [],
    festivals: [],
    match: null,
    prices: [],
    social: [],
    errors: [...errors],
  }

  let weatherFallbackUsed = false
  let searchNote = null

  for (const { name, output } of outputs) {
    let parsed
    try {
      parsed = typeof output === 'string' ? JSON.parse(output) : output
    } catch {
      signals.errors.push(`${name}: unparseable tool output`)
      continue
    }
    if (!parsed || typeof parsed !== 'object') continue

    switch (name) {
      case 'getWeather': {
        signals.weather = {
          label: parsed.label,
          footfallImpact: parsed.footfallImpact,
          recommendation: parsed.recommendation ?? '',
          temperature: parsed.temperature,
        }
        break
      }
      case 'getLocalEvents': {
        signals.events.push(...(parsed.events ?? []))
        break
      }
      case 'getFestivals': {
        signals.festivals.push(...(parsed.festivals ?? []))
        if (parsed.weddingSeason) {
          signals.festivals.push({
            name: parsed.weddingSeason.name,
            date: parsed.weddingSeason.date,
            expectedFootfall: parsed.weddingSeason.expectedFootfall,
          })
        }
        break
      }
      case 'getCricketSchedule': {
        const match = parsed.matches?.[0]
        if (match) {
          signals.match = {
            teams: match.teams,
            venue: match.venue,
            startTime: match.startTime,
            expectedCrowd: match.expectedCrowd,
          }
        }
        break
      }
      case 'getMandiPrices': {
        signals.prices.push(...(parsed.prices ?? []))
        break
      }
      case 'webSearch': {
        if (parsed.available === false) {
          // Unconfigured search is informational, not a failure: it must not
          // demote confidence on every run without a TAVILY_API_KEY.
          searchNote = parsed.note
        } else {
          signals.social.push(
            ...(parsed.results ?? []).map((result) => result.title || result.snippet).filter(Boolean),
          )
        }
        break
      }
      default:
        break
    }
  }

  if (!signals.weather) {
    weatherFallbackUsed = true
    const fallback = request?.weatherSignal
    if (fallback) {
      signals.weather = {
        label: fallback.label,
        footfallImpact: fallback.footfallImpact,
        recommendation: fallback.recommendation ?? '',
        temperature: request?.weather?.temperature,
      }
    }
  }

  // Event factor: from local events only (festivals/matches are separate factors
  // computed in the forecast node - no double counting).
  const eventFactor = (signals.events ?? []).reduce(
    (max, event) => Math.max(max, eventImpact[event?.expectedFootfall] ?? 1),
    1,
  )
  const requestEventFactor = request?.eventMultiplier ?? 1
  const event = signals.events.length ? eventFactor : requestEventFactor

  // Weekday factor comes from code, not the frontend payload.
  const weekday = weekdayPattern[dayName] ?? request?.weeklyMultiplier ?? 1

  const weather = signals.weather?.footfallImpact ?? 1

  return {
    signals,
    multiplier: {
      weather,
      event,
      weekday,
      festival: 1,
      match: 1,
      combined: clampMultiplier(weather * event * weekday),
    },
    trace: [
      ...(weatherFallbackUsed
        ? ['getWeather unavailable - used frontend-provided weather']
        : []),
      ...(searchNote ? [`webSearch: ${searchNote}`] : []),
      ...(signals.errors.length ? [`Tool errors: ${signals.errors.join(' | ')}`] : []),
    ],
  }
}

/**
 * The gatherSignals graph node: agentic tool selection + graceful degradation.
 */
export async function gatherSignals(state, deps = {}) {
  const llm = deps.llm ?? getLlm()
  const tools = deps.tools ?? signalTools

  const request = state.request ?? {}
  const today = state.date ?? todayIso()
  const dayName = request.dayName ?? dayNameFor(today)
  const stallType = state.profile?.stallType ?? 'unknown'
  const stallLabel = state.profile?.stallLabel ?? 'Unknown stall'
  const items = state.sessionIngredients ?? []

  const run = await runToolSelection({
    llm,
    tools,
    messages: buildSelectionMessages({ date: today, dayName, stallType, stallLabel, items }),
    state,
  })

  const built = buildSignalsFromOutputs({
    outputs: run.outputs,
    errors: run.errors,
    today,
    dayName,
    request,
  })

  const toolTrace = run.trace.length ? run.trace : ['No tools were needed']

  return {
    signals: built.signals,
    multiplier: built.multiplier,
    trace: [
      `${dayName} (${today})`,
      `Signals gathered in ${run.turns} turn(s), ${run.totalCalls} tool call(s)`,
      ...toolTrace,
      `Weather: ${built.signals.weather?.label ?? 'unknown'} (impact x${built.multiplier.weather})`,
      `Events: ${built.signals.events.length} local event(s) (impact x${built.multiplier.event})`,
      `Festivals: ${built.signals.festivals.length}, match: ${built.signals.match ? built.signals.match.teams : 'none'}`,
      `Weekday factor (${dayName}): x${built.multiplier.weekday}`,
      `Combined demand multiplier: x${built.multiplier.combined}`,
      ...built.trace,
    ],
  }
}
