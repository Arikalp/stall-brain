import { getLlm } from '../../llm.js'
import { getWeatherTool } from '../../tools/weather.js'
import { getFestivalsTool, getLocalEventsTool } from '../../tools/events.js'
import { getCricketScheduleTool } from '../../tools/cricket.js'
import { getMandiPricesTool } from '../../tools/prices.js'
import { getSocialBuzzTool, webSearchTool } from '../../tools/search.js'
import { eventImpact, weekdayPattern } from '../../data/baselines.js'
import { clampMultiplier } from './forecast.js'
import { addDays, dayNameFor, todayIso } from '../../utils/dates.js'

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
  getSocialBuzzTool,
  webSearchTool,
]

const SELECTION_PROMPT = `You gather market signals for a street vendor's daily procurement forecast in Hazratganj, Lucknow.

Choose which tools to call, guided by the stall type:
- Weather (getWeather): always call once. Rain kills chai/bhutta/juice footfall; heat drives juice demand. Returns 3-day lookahead.
- Festivals & weddings (getFestivals): call for flower stalls always (pooja + wedding demand), and for any stall when a festival may be near.
- Local events/melas (getLocalEvents): call for snacks, chaat, balloon/toy stalls, and whenever crowds gather.
- Cricket fixtures (getCricketSchedule): call for chai, snacks, chaat and balloon stalls on possible match days.
- Mandi prices (getMandiPrices): call when the vendor needs price context; pass their ingredient names.
- Social buzz (getSocialBuzz): call to scan public hashtags (#Hazratganj, #LucknowFoodies) for sudden viral crowd spikes or road closures.
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
    let response
    try {
      response = await llmWithTools.invoke(conversation)
    } catch (error) {
      // T4.3: When Groq is unreachable, run direct core signal tools deterministically
      // without the LLM selector and record a signal warning so confidence drops cleanly.
      const reason = error?.message ?? String(error)
      errors.push(`llm-gather: ${reason}`)
      trace.push('LLM unavailable for tool selection — ran direct signal tools fallback')
      const fallbackNames = [
        'getWeather',
        'getFestivals',
        'getLocalEvents',
        'getCricketSchedule',
        'getMandiPrices',
      ]
      const fallbackCalls = fallbackNames
        .filter((name) => Boolean(toolsByName[name]))
        .map((name, idx) => ({
          name,
          args:
            name === 'getMandiPrices' && state?.sessionIngredients?.length
              ? { items: state.sessionIngredients }
              : {},
          id: `fallback-${idx}`,
        }))
      if (fallbackCalls.length) {
        totalCalls += fallbackCalls.length
        const turn = await executeToolCalls({ calls: fallbackCalls, toolsByName })
        outputs.push(...turn.outputs)
        errors.push(...turn.errors)
      }
      break
    }

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
    socialBuzz: null,
    lookahead: [],
    errors: [...errors],
  }

  let weatherFallbackUsed = false
  let searchNote = null
  let weatherLookahead = []
  let allMatches = []

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
          ...(parsed.rainProbabilityPeak != null
            ? { rainProbabilityPeak: parsed.rainProbabilityPeak }
            : {}),
        }
        weatherLookahead = Array.isArray(parsed.lookahead) ? parsed.lookahead : []
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
        allMatches = parsed.matches ?? []
        const match = allMatches[0]
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
      case 'getSocialBuzz': {
        signals.socialBuzz = parsed
        if (parsed.hasSpike && parsed.label) {
          signals.social.push(`${parsed.label}: ${parsed.summary ?? ''}`.trim())
        } else if (parsed.available === false && parsed.summary) {
          searchNote = parsed.summary
        }
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

  // Build 3-day lookahead (T3.4): today, tomorrow, day+2.
  const lookaheadDates = [0, 1, 2].map((offset) => addDays(today, offset))
  signals.lookahead = lookaheadDates.map((d, idx) => {
    const wDay =
      weatherLookahead.find((w) => w.date === d) ??
      (idx === 0 && signals.weather
        ? {
            date: d,
            label: signals.weather.label,
            footfallImpact: signals.weather.footfallImpact,
            temperature: signals.weather.temperature,
            rainProbabilityPeak: signals.weather.rainProbabilityPeak,
          }
        : null)
    const dayEvents = (signals.events ?? []).filter((e) => !e.date || e.date === d)
    const dayFestivals = (signals.festivals ?? []).filter((f) => !f.date || f.date === d)
    const dayMatch =
      allMatches.find((m) => m.date === d) ?? (idx === 0 ? signals.match : null)
    return {
      date: d,
      weather: wDay
        ? {
            label: wDay.label,
            footfallImpact: wDay.footfallImpact,
            ...(wDay.temperature != null ? { temperature: wDay.temperature } : {}),
            ...(wDay.rainProbabilityPeak != null
              ? { rainProbabilityPeak: wDay.rainProbabilityPeak }
              : {}),
          }
        : null,
      events: dayEvents,
      festivals: dayFestivals,
      match: dayMatch
        ? {
            teams: dayMatch.teams,
            venue: dayMatch.venue,
            startTime: dayMatch.startTime,
            expectedCrowd: dayMatch.expectedCrowd,
          }
        : null,
    }
  })

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
  const social = signals.socialBuzz?.factor ?? 1

  return {
    signals,
    multiplier: {
      weather,
      event,
      weekday,
      festival: 1,
      match: 1,
      social,
      combined: clampMultiplier(weather * event * weekday * social),
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
 * Applies deterministic What-If signal overrides for T3.5 simulation mode.
 */
export function applySignalOverrides(built, overrides = {}, today = todayIso()) {
  if (!overrides || typeof overrides !== 'object') return built
  const signals = {
    ...built.signals,
    events: [...(built.signals.events ?? [])],
    social: [...(built.signals.social ?? [])],
    lookahead: [...(built.signals.lookahead ?? [])],
  }
  const applied = []

  if (
    overrides.weatherLabel !== undefined ||
    overrides.weatherFootfallImpact !== undefined ||
    overrides.rainProbabilityPeak !== undefined
  ) {
    const impact = overrides.weatherFootfallImpact ?? signals.weather?.footfallImpact ?? 0.65
    signals.weather = {
      label: overrides.weatherLabel ?? signals.weather?.label ?? 'Heavy Rain (What-If Simulation)',
      footfallImpact: impact,
      recommendation:
        impact < 0.85
          ? 'What-If simulated rain/bad weather: cut perishables & keep stock lean.'
          : 'Simulated weather scenario.',
      temperature: signals.weather?.temperature ?? 26,
      ...(overrides.rainProbabilityPeak != null
        ? { rainProbabilityPeak: overrides.rainProbabilityPeak }
        : {}),
    }
    if (signals.lookahead[0]) {
      signals.lookahead[0] = {
        ...signals.lookahead[0],
        weather: {
          label: signals.weather.label,
          footfallImpact: signals.weather.footfallImpact,
          ...(signals.weather.temperature != null ? { temperature: signals.weather.temperature } : {}),
          ...(signals.weather.rainProbabilityPeak != null
            ? { rainProbabilityPeak: signals.weather.rainProbabilityPeak }
            : {}),
        },
      }
    }
    applied.push(`Weather -> ${signals.weather.label} (x${signals.weather.footfallImpact})`)
  }

  if (overrides.eventName || overrides.eventExpectedFootfall) {
    const ev = {
      name: overrides.eventName ?? 'Simulated Market Event',
      date: today,
      distanceKm: 0.4,
      expectedFootfall: overrides.eventExpectedFootfall ?? 'high',
    }
    signals.events.push(ev)
    applied.push(`Event -> ${ev.name} (${ev.expectedFootfall})`)
  }

  if (overrides.matchPresent === true) {
    signals.match = signals.match ?? {
      teams: 'LSG vs RCB (What-If Match)',
      venue: 'Ekana Cricket Stadium',
      startTime: '7:30 PM',
      expectedCrowd: 'high',
    }
    applied.push(`Match -> ${signals.match.teams}`)
  } else if (overrides.matchPresent === false) {
    signals.match = null
    applied.push('Match -> none')
  }

  if (overrides.socialSpike === true) {
    signals.socialBuzz = {
      hasSpike: true,
      direction: 'up',
      factor: 1.1,
      label: 'Simulated #Hazratganj viral crowd spike',
      topics: ['#Hazratganj', '#LucknowFoodies'],
      summary: 'Simulated social buzz spike (+10% demand uplift).',
      source: 'what-if-simulation',
      available: true,
      isMock: true,
    }
    signals.social.push(signals.socialBuzz.label)
    applied.push('Social buzz -> #Hazratganj spike (x1.1)')
  } else if (overrides.socialSpike === false) {
    signals.socialBuzz = null
    applied.push('Social buzz -> neutral')
  }

  const eventFactor = signals.events.reduce(
    (max, event) => Math.max(max, eventImpact[event?.expectedFootfall] ?? 1),
    1,
  )
  const weather = signals.weather?.footfallImpact ?? 1
  const weekday = built.multiplier.weekday ?? 1
  const social = signals.socialBuzz?.factor ?? 1

  return {
    signals,
    multiplier: {
      ...built.multiplier,
      weather,
      event: eventFactor,
      social,
      combined: clampMultiplier(weather * eventFactor * weekday * social),
    },
    trace: [
      ...built.trace,
      ...(applied.length ? [`What-If simulation overrides: ${applied.join('; ')}`] : []),
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

  const rawBuilt = buildSignalsFromOutputs({
    outputs: run.outputs,
    errors: run.errors,
    today,
    dayName,
    request,
  })
  const built = state.signalOverrides
    ? applySignalOverrides(rawBuilt, state.signalOverrides, today)
    : rawBuilt

  const toolTrace = run.trace.length ? run.trace : ['No tools were needed']

  return {
    signals: built.signals,
    multiplier: built.multiplier,
    trace: [
      `${dayName} (${today})${state.simulation ? ' [WHAT-IF SIMULATION]' : ''}`,
      `Signals gathered in ${run.turns} turn(s), ${run.totalCalls} tool call(s)`,
      ...toolTrace,
      `Weather: ${built.signals.weather?.label ?? 'unknown'} (impact x${built.multiplier.weather})`,
      `Events: ${built.signals.events.length} local event(s) (impact x${built.multiplier.event})`,
      `Festivals: ${built.signals.festivals.length}, match: ${built.signals.match ? built.signals.match.teams : 'none'}`,
      ...(built.signals.socialBuzz?.hasSpike
        ? [`Social buzz: ${built.signals.socialBuzz.label} (x${built.multiplier.social})`]
        : []),
      `Weekday factor (${dayName}): x${built.multiplier.weekday}`,
      `Combined demand multiplier: x${built.multiplier.combined}`,
      ...built.trace,
    ],
  }
}
