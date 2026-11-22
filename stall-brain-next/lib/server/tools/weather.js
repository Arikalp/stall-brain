import { z } from 'zod'
import { tool } from '@langchain/core/tools'
import { cachedLookup } from '../utils/cache.js'
import { withRetry } from '../utils/retry.js'

/**
 * Real Open-Meteo weather for Hazratganj, Lucknow (hourly + daily).
 * Maps weather codes to the same footfall labels the frontend used, so the
 * response shape stays familiar.
 */

export const HAZRATGANJ = { latitude: 26.8467, longitude: 80.9462, label: 'Hazratganj, Lucknow' }

/** Same mapping as src/utils/weatherLogic.js on the frontend. */
export const weatherMappings = [
  { codes: [0], label: 'Clear & Sunny ☀️', footfallImpact: 1.2, recommendation: 'Stock up, clear skies boost footfall.' },
  { codes: [1, 2, 3], label: 'Partly Cloudy ⛅', footfallImpact: 1.05, recommendation: 'Normal stocking with mild uplift.' },
  { codes: [45, 48], label: 'Foggy 🌫️', footfallImpact: 0.85, recommendation: 'Expect slower footfall early morning.' },
  { codes: [51, 53, 55, 56, 57, 61, 63, 65, 66, 67], label: 'Rain / Drizzle 🌧️', footfallImpact: 0.7, recommendation: 'Stock less; rain may reduce walk-ins.' },
  { codes: [80, 81, 82], label: 'Showers 🌦️', footfallImpact: 0.75, recommendation: 'Keep essentials; short showers expected.' },
  { codes: [95, 96, 99], label: 'Thunderstorm ⛈️', footfallImpact: 0.4, recommendation: 'Expect a sharp drop; keep essentials only.' },
]

const defaultSignal = { label: 'Weather Unknown', footfallImpact: 1, recommendation: 'Plan for regular demand.' }

export function mapWeatherCode(code) {
  return weatherMappings.find((mapping) => mapping.codes.includes(code)) ?? defaultSignal
}

/**
 * Fetches today's weather signal from Open-Meteo.
 * Injected `fetch` keeps this testable; throws on network failure so callers
 * can record the failure in signals.errors.
 */
export async function fetchWeatherSignal({ date, fetchImpl = fetch } = {}) {
  const target = date ?? new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date())
  const isCustomFetch = fetchImpl !== fetch

  return cachedLookup(
    `weather:${target}`,
    async () => {
      const params = new URLSearchParams({
        latitude: String(HAZRATGANJ.latitude),
        longitude: String(HAZRATGANJ.longitude),
        hourly: 'temperature_2m,precipitation_probability,weather_code',
        daily: 'temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code',
        timezone: 'Asia/Kolkata',
        forecast_days: '3',
      })

      const data = await withRetry(
        async () => {
          const response = await fetchImpl(`https://api.open-meteo.com/v1/forecast?${params}`, {
            signal: AbortSignal.timeout(8000),
          })
          if (!response.ok) {
            throw new Error(`Open-Meteo responded ${response.status}`)
          }
          return response.json()
        },
        { retries: isCustomFetch ? 0 : 1, delayMs: 150, timeoutMs: 9000, label: 'open-meteo' },
      )

      const times = data?.hourly?.time ?? []
      const dayIndex = times.findIndex((time) => time.startsWith(target))
      if (dayIndex === -1) {
        throw new Error(`Open-Meteo has no forecast for ${target}`)
      }

      function summarizeDay(startIdx) {
        const hours = times.slice(startIdx, startIdx + 24)
        if (!hours.length) return null
        const dateStr = hours[0].slice(0, 10)
        const temps = (data.hourly.temperature_2m ?? []).slice(startIdx, startIdx + 24)
        const codes = (data.hourly.weather_code ?? []).slice(startIdx, startIdx + 24)
        const rain = (data.hourly.precipitation_probability ?? []).slice(startIdx, startIdx + 24)

        const dayCode = codes[12] ?? codes[0] ?? 0
        const signal = mapWeatherCode(dayCode)
        const maxRain = rain.length ? Math.max(...rain.map((value) => value ?? 0)) : 0
        const peakRainHour = rain.indexOf(maxRain)
        return {
          date: dateStr,
          label: signal.label,
          footfallImpact: signal.footfallImpact,
          recommendation: `${signal.recommendation}${maxRain > 40 ? ` Rain probability peaks at ${maxRain}% around ${hours[peakRainHour]?.slice(11) ?? ''}.` : ''}`,
          temperature: Math.round(temps[12] ?? temps[0] ?? 0),
          rainProbabilityPeak: maxRain,
        }
      }

      const todaySummary = summarizeDay(dayIndex)
      const lookahead = [0, 1, 2]
        .map((offset) => summarizeDay(dayIndex + offset * 24))
        .filter(Boolean)

      return {
        ...todaySummary,
        lookahead,
        source: 'open-meteo',
        isMock: false,
      }
    },
    { bypass: isCustomFetch },
  )
}

const WeatherInput = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

export const getWeatherTool = tool(
  async ({ date }) => JSON.stringify(await fetchWeatherSignal({ date })),
  {
    name: 'getWeather',
    description:
      "Get today's weather for Hazratganj, Lucknow: temperature, rain probability by hour, and the footfall impact for street vendors. Always useful; critical for chai, bhutta (roasted corn) and juice stalls.",
    schema: WeatherInput,
  },
)
