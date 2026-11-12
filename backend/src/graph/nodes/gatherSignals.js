/**
 * Gathers signals about the world: weather, events, festivals, cricket, prices.
 * T1.3 replaces this stub with real tool calls chosen by the LLM; for now it
 * maps the signals the frontend already computed into the state.
 *
 * Side-effect free.
 */
export async function gatherSignals(state) {
  const request = state.request ?? {}

  const signals = {
    weather: request.weatherSignal
      ? {
          label: request.weatherSignal.label,
          footfallImpact: request.weatherSignal.footfallImpact,
          recommendation: request.weatherSignal.recommendation ?? '',
          temperature: request.weather?.temperature,
        }
      : null,
    events: request.eventSummary ? [{ name: request.eventSummary, date: state.date }] : [],
    festivals: [],
    match: null,
    prices: [],
    social: [],
    errors: [],
  }

  return {
    signals,
    multiplier: {
      weather: request.weatherSignal?.footfallImpact ?? 1,
      event: request.eventMultiplier ?? 1,
      weekday: request.weeklyMultiplier ?? 1,
      festival: 1,
      match: 1,
      combined: request.demandMultiplier ?? 1,
    },
    trace: [
      `Weather: ${signals.weather?.label ?? 'unknown'} (impact x${signals.weather?.footfallImpact ?? 1})`,
      `Events: ${request.eventSummary ?? 'none reported'} (impact x${request.eventMultiplier ?? 1})`,
      `Day-of-week (${request.dayName}): x${request.weeklyMultiplier ?? 1}`,
      `Combined demand multiplier: x${request.demandMultiplier ?? 1}`,
    ],
  }
}
