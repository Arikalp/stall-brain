import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import Header from '../components/Header'
import SignalPanel from '../components/SignalPanel'
import ForecastOutput from '../components/ForecastOutput'
import FeedbackBar from '../components/FeedbackBar'
import HistoryLog from '../components/HistoryLog'
import LoadingState from '../components/LoadingState'
import { stalls } from '../data/stalls'
import { getEventsForDate, getWeeklyMultiplier } from '../data/events'
import { getWeatherSignal } from '../utils/weatherLogic'
import { requestGroqForecast } from '../utils/groqAgent'
import { getTodayInfo } from '../utils/dateTime'
import { clearSelection, loadSelection } from '../utils/selectionStorage'

const WEATHER_URL =
  'https://api.open-meteo.com/v1/forecast?latitude=26.85&longitude=80.95&current=temperature_2m,weathercode,windspeed_10m&daily=weathercode,temperature_2m_max,precipitation_sum&timezone=Asia%2FKolkata&forecast_days=1'
const FALLBACK_WEATHER = {
  temperature: 32,
  weathercode: 0,
  windspeed: 8,
}
const HISTORY_KEY = 'bazaarBrainHistory'
const LOADING_DURATION = 600 * 5 + 200

const ERROR_COPY = {
  MISSING_API_KEY: {
    title: 'Connect your Groq key',
    message:
      'Add VITE_GROQ_API_KEY to your environment file and restart the dev server.',
    action: 'I added the key, retry',
  },
  GROQ_REQUEST_FAILED: {
    title: 'Groq is unavailable',
    message: 'We could not reach the Groq API. Try again in a moment.',
    action: 'Retry forecast',
  },
  GROQ_PARSE_FAILED: {
    title: 'Forecast response was unclear',
    message: 'The AI response did not parse cleanly. Try regenerating.',
    action: 'Regenerate forecast',
  },
  UNKNOWN: {
    title: 'Something went wrong',
    message: 'Please retry the forecast when you are ready.',
    action: 'Retry forecast',
  },
}

function loadHistory() {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch (error) {
    return []
  }
}

function saveHistory(items) {
  if (typeof window === 'undefined') return
  localStorage.setItem(HISTORY_KEY, JSON.stringify(items))
}

function createId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return `bb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function getErrorDetails(code) {
  return ERROR_COPY[code] ?? ERROR_COPY.UNKNOWN
}

export default function ForecastPage() {
  const navigate = useNavigate()
  const selection = useMemo(() => loadSelection(), [])
  const dateInfo = useMemo(() => getTodayInfo(), [])
  const stall = useMemo(() => {
    if (!selection?.stallId) return null
    return stalls.find((entry) => entry.id === selection.stallId) ?? null
  }, [selection?.stallId])
  const items = selection?.items ?? []

  const [phase, setPhase] = useState('loadingSignals')
  const [weather, setWeather] = useState(null)
  const [weatherSignal, setWeatherSignal] = useState(getWeatherSignal(0))
  const [fallbackWeather, setFallbackWeather] = useState(false)
  const [forecast, setForecast] = useState(null)
  const [showHindi, setShowHindi] = useState(false)
  const [errorState, setErrorState] = useState(null)
  const [feedback, setFeedback] = useState(null)
  const [history, setHistory] = useState([])
  const [currentHistoryId, setCurrentHistoryId] = useState(null)
  const [historyOpen, setHistoryOpen] = useState(false)

  const hasTriggered = useRef(false)

  const eventsToday = useMemo(() => {
    return getEventsForDate(dateInfo.dateString)
  }, [dateInfo.dateString])

  const eventSummary = eventsToday.length
    ? eventsToday.map((event) => event.name).join(' | ')
    : ''
  const eventSummaryForPrompt = eventSummary || 'No special events'
  const eventMultiplier = eventsToday.length
    ? Math.max(...eventsToday.map((event) => event.impactMultiplier))
    : 1
  const weeklyMultiplier = getWeeklyMultiplier(dateInfo.dayName)

  const effectiveWeather = weather ?? FALLBACK_WEATHER
  const effectiveWeatherSignal = weatherSignal ?? getWeatherSignal(0)
  const demandMultiplier =
    (effectiveWeatherSignal.footfallImpact ?? 1) *
    eventMultiplier *
    weeklyMultiplier

  useEffect(() => {
    setHistory(loadHistory())
  }, [])

  useEffect(() => {
    if (!stall) return

    let active = true
    const controller = new AbortController()

    setPhase('loadingSignals')
    setWeather(null)
    setWeatherSignal(getWeatherSignal(0))
    setFallbackWeather(false)
    setForecast(null)
    setErrorState(null)
    setShowHindi(false)
    setFeedback(null)
    setCurrentHistoryId(null)

    async function fetchWeather() {
      try {
        const response = await fetch(WEATHER_URL, {
          signal: controller.signal,
        })
        if (!response.ok) {
          throw new Error('WEATHER_REQUEST_FAILED')
        }
        const data = await response.json()
        const temperature = data?.current?.temperature_2m
        const weathercode = data?.current?.weathercode
        const windspeed = data?.current?.windspeed_10m

        if (!active) return

        setWeather({
          temperature: Number.isFinite(temperature)
            ? temperature
            : FALLBACK_WEATHER.temperature,
          weathercode: Number.isFinite(weathercode)
            ? weathercode
            : FALLBACK_WEATHER.weathercode,
          windspeed: Number.isFinite(windspeed)
            ? windspeed
            : FALLBACK_WEATHER.windspeed,
        })
        setWeatherSignal(
          getWeatherSignal(Number.isFinite(weathercode) ? weathercode : 0),
        )
        setFallbackWeather(false)
        setPhase('signalsReady')
      } catch (error) {
        if (!active) return
        setWeather({ ...FALLBACK_WEATHER })
        setWeatherSignal(getWeatherSignal(FALLBACK_WEATHER.weathercode))
        setFallbackWeather(true)
        setPhase('signalsReady')
      }
    }

    fetchWeather()

    return () => {
      active = false
      controller.abort()
    }
  }, [stall])

  const handleForecast = async () => {
    if (!stall) return

    setPhase('loadingForecast')
    setErrorState(null)
    setForecast(null)
    setShowHindi(false)
    setFeedback(null)

    const delay = new Promise((resolve) => {
      setTimeout(resolve, LOADING_DURATION)
    })

    try {
      const forecastPromise = requestGroqForecast({
        stall,
        items,
        dateLabel: dateInfo.dateLabel,
        dayName: dateInfo.dayName,
        weather: effectiveWeather,
        weatherSignal: effectiveWeatherSignal,
        eventSummary: eventSummaryForPrompt,
        weeklyMultiplier,
        eventMultiplier,
        demandMultiplier: Number(demandMultiplier.toFixed(2)),
      })

      const [result] = await Promise.all([forecastPromise, delay])

      const entryId = createId()
      const newEntry = {
        id: entryId,
        date: dateInfo.dateString,
        dateLabel: dateInfo.dateLabel,
        stallId: stall.id,
        stallName: stall.name,
        expectedCustomers: result.expectedCustomers,
        demandMultiplier: Number(demandMultiplier.toFixed(2)),
        summary: result.summary,
        feedback: null,
      }

      setCurrentHistoryId(entryId)
      setHistory((prev) => {
        const filtered = prev.filter(
          (item) => item.date !== newEntry.date || item.stallId !== newEntry.stallId,
        )
        const next = [newEntry, ...filtered].slice(0, 5)
        saveHistory(next)
        return next
      })

      setForecast(result)
      setPhase('forecastReady')
    } catch (error) {
      await delay
      setErrorState(error?.code ?? 'UNKNOWN')
      setPhase('error')
    }
  }

  useEffect(() => {
    if (!stall || hasTriggered.current || phase !== 'signalsReady') return
    hasTriggered.current = true
    handleForecast()
  }, [stall, phase])

  const handleFeedback = (value) => {
    setFeedback(value)
    if (!currentHistoryId) return
    setHistory((prev) => {
      const next = prev.map((item) =>
        item.id === currentHistoryId ? { ...item, feedback: value } : item,
      )
      saveHistory(next)
      return next
    })
  }


  if (!stall || items.length < 1 || !selection?.confirmed) {
    return <Navigate to="/setup" replace />
  }

  const errorDetails = errorState ? getErrorDetails(errorState) : null
  const showForecast = Boolean(phase === 'forecastReady' && forecast)
  const showError = Boolean(phase === 'error' && errorDetails)

  return (
    <main className="relative min-h-screen">
      <div className="relative z-10 mx-auto flex min-h-screen max-w-6xl flex-col px-4 pb-12 pt-8 sm:px-6 lg:px-10">
        <Header />

        <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-sm text-[var(--color-text-secondary)]">
            <span className="rounded-full border border-[var(--color-border)] bg-[var(--color-bg-card)] px-3 py-1">
              {dateInfo.dateLabel}
            </span>
            <span className="rounded-full border border-[var(--color-border)] bg-[var(--color-bg-card)] px-3 py-1">
              {stall.name}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => {
                clearSelection()
                navigate('/')
              }}
              className="inline-flex items-center rounded-full border border-[var(--color-border)] bg-transparent px-4 py-2 text-sm font-semibold text-[var(--color-text-secondary)] transition hover:bg-[var(--color-bg-card-hover)]"
            >
              Start Over
            </button>
            <Link
              to="/setup"
              className="inline-flex items-center rounded-full border border-[var(--color-border)] bg-transparent px-4 py-2 text-sm font-semibold text-[var(--color-text-secondary)] transition hover:bg-[var(--color-bg-card-hover)]"
            >
              Edit Items
            </Link>
          </div>
        </div>

        <SignalPanel
          weather={effectiveWeather}
          weatherSignal={effectiveWeatherSignal}
          eventSummary={eventSummary}
          eventMultiplier={eventMultiplier}
          dayName={dateInfo.dayName}
          dayMultiplier={weeklyMultiplier}
          fallbackWeather={fallbackWeather}
          loading={phase === 'loadingSignals'}
        />

        {phase === 'loadingForecast' ? <LoadingState active /> : null}

        {showForecast ? (
          <ForecastOutput
            forecast={forecast}
            demandMultiplier={demandMultiplier}
            showHindi={showHindi}
            onToggleHindi={() => setShowHindi((prev) => !prev)}
            onRegenerate={handleForecast}
          />
        ) : null}

        {phase === 'forecastReady' ? (
          <FeedbackBar feedback={feedback} onFeedback={handleFeedback} />
        ) : null}

        {showError ? (
          <div className="mt-8 rounded-2xl border border-[var(--color-danger)] bg-[rgba(248,113,113,0.12)] p-6">
            <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">
              {errorDetails.title}
            </h3>
            <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
              {errorDetails.message}
            </p>
            <button
              type="button"
              onClick={handleForecast}
              className="mt-4 inline-flex items-center gap-2 rounded-full border border-[var(--color-danger)] bg-transparent px-4 py-2 text-sm font-semibold text-[var(--color-text-primary)] transition hover:bg-[rgba(248,113,113,0.12)]"
            >
              {errorDetails.action}
            </button>
          </div>
        ) : null}

        <HistoryLog
          history={history}
          collapsed={!historyOpen}
          onToggle={() => setHistoryOpen((prev) => !prev)}
        />
      </div>
    </main>
  )
}
