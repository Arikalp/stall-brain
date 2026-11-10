import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { X } from 'lucide-react'
import Header from '../components/Header'
import SignalPanel from '../components/SignalPanel'
import ForecastOutput from '../components/ForecastOutput'
import FeedbackBar from '../components/FeedbackBar'
import HistoryLog from '../components/HistoryLog'
import LoadingState from '../components/LoadingState'
import { getEventsForDate, getWeeklyMultiplier } from '../data/events'
import { getWeatherSignal } from '../utils/weatherLogic'
import { requestGroqForecast } from '../utils/groqAgent'
import { getTodayInfo } from '../utils/dateTime'
import { loadProfile } from '../utils/profileStorage'
import {
  createSessionFromProfile,
  INVENTORY_UNITS,
  loadForecastSession,
  saveForecastSession,
} from '../utils/forecastSessionStore'

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
  AUTH_REQUIRED: {
    title: 'Sign in required',
    message: 'Please log in again so we can generate your forecast.',
    action: 'Retry forecast',
  },
  RATE_LIMITED: {
    title: 'Too many requests',
    message:
      'You have requested a lot of forecasts in a short time. Please wait a few minutes and try again.',
    action: 'Retry forecast',
  },
  VALIDATION_FAILED: {
    title: 'Something was off with your request',
    message: 'We could not process this forecast request. Try again.',
    action: 'Retry forecast',
  },
  FORECAST_UNAVAILABLE: {
    title: 'Forecast service unavailable',
    message: 'The forecast service is not responding. Try again in a moment.',
    action: 'Retry forecast',
  },
  FORECAST_INVALID: {
    title: 'Forecast response was unclear',
    message: 'The AI response did not parse cleanly. Try regenerating.',
    action: 'Regenerate forecast',
  },
  NETWORK_ERROR: {
    title: "Can't reach the server",
    message:
      'The forecast backend is not reachable. Check your connection (or start the backend server) and retry.',
    action: 'Retry forecast',
  },
  REQUEST_FAILED: {
    title: 'Something went wrong',
    message: 'Please retry the forecast when you are ready.',
    action: 'Retry forecast',
  },
  UNKNOWN: {
    title: 'Something went wrong',
    message: 'Please retry the forecast when you are ready.',
    action: 'Retry forecast',
  },
}

function buildInventorySnapshot(items, inventory) {
  return items.reduce((acc, item) => {
    const entry = inventory?.[item] ?? {}
    const quantity = Number(entry.quantity)
    const safeQuantity = Number.isFinite(quantity) && quantity > 0 ? quantity : 0
    const unit =
      typeof entry.unit === 'string' && entry.unit.trim()
        ? entry.unit
        : INVENTORY_UNITS[0]
    acc[item] = { quantity: safeQuantity, unit }
    return acc
  }, {})
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
  const [profile] = useState(() => loadProfile())
  const dateInfo = useMemo(() => getTodayInfo(), [])
  const [initialSession] = useState(() => {
    if (!profile) return { sessionIngredients: [], inventory: {} }
    return loadForecastSession() ?? createSessionFromProfile(profile)
  })
  const [sessionIngredients, setSessionIngredients] = useState(
    initialSession.sessionIngredients,
  )
  const [inventory, setInventory] = useState(initialSession.inventory)
  const [newItem, setNewItem] = useState('')
  const [itemError, setItemError] = useState('')
  const sessionReady = Boolean(profile)

  const stall = useMemo(() => {
    if (!profile) return null
    return {
      id: profile.stallType,
      name: profile.stallLabel,
      emoji: profile.stallEmoji,
      items: profile.ingredients,
    }
  }, [
    profile?.stallType,
    profile?.stallLabel,
    profile?.stallEmoji,
    profile?.ingredients,
  ])

  const [phase, setPhase] = useState('loadingSignals')
  const [weather, setWeather] = useState(null)
  const [weatherSignal, setWeatherSignal] = useState(getWeatherSignal(0))
  const [fallbackWeather, setFallbackWeather] = useState(false)
  const [forecast, setForecast] = useState(null)
  const [showHindi, setShowHindi] = useState(false)
  const [errorState, setErrorState] = useState(null)
  const [feedback, setFeedback] = useState(null)
  const [history, setHistory] = useState(() => loadHistory())
  const [currentHistoryId, setCurrentHistoryId] = useState(null)
  const [historyOpen, setHistoryOpen] = useState(false)

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
    if (!sessionReady) return
    saveForecastSession({ sessionIngredients, inventory })
  }, [sessionIngredients, inventory, sessionReady])

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
        setPhase((prev) => (prev === 'loadingSignals' ? 'signalsReady' : prev))
      } catch (error) {
        if (!active) return
        setWeather({ ...FALLBACK_WEATHER })
        setWeatherSignal(getWeatherSignal(FALLBACK_WEATHER.weathercode))
        setFallbackWeather(true)
        setPhase((prev) => (prev === 'loadingSignals' ? 'signalsReady' : prev))
      }
    }

    fetchWeather()

    return () => {
      active = false
      controller.abort()
    }
  }, [stall?.id])

  const handleRemoveItem = (itemName) => {
    setSessionIngredients((prev) => prev.filter((item) => item !== itemName))
    setInventory((prev) => {
      const next = { ...prev }
      delete next[itemName]
      return next
    })
  }

  const handleAddItem = () => {
    const trimmed = newItem.trim()
    if (!trimmed) return

    setSessionIngredients((prev) => {
      const exists = prev.some(
        (item) => item.toLowerCase() === trimmed.toLowerCase(),
      )
      if (exists) return prev
      return [...prev, trimmed]
    })
    setInventory((prev) => ({
      ...prev,
      [trimmed]: prev[trimmed] ?? { quantity: 0, unit: INVENTORY_UNITS[0] },
    }))
    setNewItem('')
    setItemError('')
  }

  const handleInventoryChange = (itemName, field, value) => {
    setInventory((prev) => {
      const current = prev[itemName] ?? { quantity: 0, unit: INVENTORY_UNITS[0] }
      if (field === 'quantity') {
        const quantity = Number(value)
        return {
          ...prev,
          [itemName]: {
            ...current,
            quantity:
              Number.isFinite(quantity) && quantity >= 0 ? quantity : 0,
          },
        }
      }
      return {
        ...prev,
        [itemName]: {
          ...current,
          unit: value,
        },
      }
    })
  }

  const handleForecast = async () => {
    if (!stall) return
    if (sessionIngredients.length < 1) {
      setItemError('Add at least one item to get a forecast.')
      return
    }

    setPhase('loadingForecast')
    setErrorState(null)
    setForecast(null)
    setShowHindi(false)
    setFeedback(null)

    const inventorySnapshot = buildInventorySnapshot(
      sessionIngredients,
      inventory,
    )

    const delay = new Promise((resolve) => {
      setTimeout(resolve, LOADING_DURATION)
    })

    try {
      const forecastPromise = requestGroqForecast({
        stall,
        items: sessionIngredients,
        inventory: inventorySnapshot,
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
        inventorySnapshot,
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

  if (!profile || !stall) {
    return (
      <Navigate
        to="/profile"
        replace
        state={{
          banner: 'Set up your stall profile first to get your forecast.',
        }}
      />
    )
  }

  const errorDetails = errorState ? getErrorDetails(errorState) : null
  const showForecast = Boolean(phase === 'forecastReady' && forecast)
  const showError = Boolean(phase === 'error' && errorDetails)
  const itemsTodayLabel = `${sessionIngredients.length} items today`
  const stockCount = sessionIngredients.filter((item) => {
    const quantity = Number(inventory?.[item]?.quantity ?? 0)
    return Number.isFinite(quantity) && quantity > 0
  }).length

  return (
    <main className="relative min-h-screen">
      <div className="relative z-10 mx-auto flex min-h-screen max-w-6xl flex-col px-4 pb-12 pt-8 sm:px-6 lg:px-10">
        <Header />

        <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-sm text-[var(--color-text-secondary)]">
            <span className="rounded-full border border-[var(--color-border)] bg-[var(--color-bg-card)] px-3 py-1">
              {dateInfo.dateLabel}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              to="/profile"
              className="inline-flex items-center rounded-full border border-[var(--color-border)] bg-transparent px-4 py-2 text-sm font-semibold text-[var(--color-text-secondary)] transition hover:bg-[var(--color-bg-card-hover)]"
            >
              Profile
            </Link>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-card)] px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="text-3xl">{stall.emoji}</span>
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-[var(--color-text-muted)]">
                  Stall identity
                </p>
                <p className="text-base font-semibold text-[var(--color-text-primary)]">
                  {stall.name}
                </p>
              </div>
            </div>
            <Link
              to="/profile"
              className="text-sm font-semibold text-[var(--color-primary)] transition hover:text-[var(--color-primary-dark)]"
            >
              Edit in Profile -
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

        <section className="mt-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
                Today&apos;s Items
              </h2>
              <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                These are loaded from your profile. Add or remove items just for
                today - your profile won&apos;t change.
              </p>
            </div>
            <span className="text-sm font-semibold text-[var(--color-text-secondary)]">
              {itemsTodayLabel}
            </span>
          </div>

          <div className="mt-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4">
            <div className="space-y-3">
              {sessionIngredients.length ? (
                sessionIngredients.map((item) => (
                  <div
                    key={item}
                    className="flex items-center justify-between rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-input)] px-4 py-3"
                  >
                    <span className="text-sm font-semibold text-[var(--color-text-primary)]">
                      {item}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(item)}
                      className="rounded-full border border-transparent p-1 text-[var(--color-text-muted)] transition hover:border-[var(--color-danger)] hover:text-[var(--color-danger)]"
                      aria-label={`Remove ${item}`}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))
              ) : (
                <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-input)] px-4 py-3 text-sm text-[var(--color-text-muted)]">
                  Add at least one item to get a forecast.
                </div>
              )}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-bg-input)] px-3 py-2 focus-within:border-[var(--color-border-focus)]">
              <input
                value={newItem}
                onChange={(event) => setNewItem(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    handleAddItem()
                  }
                }}
                placeholder="Add item for today..."
                className="flex-1 bg-transparent text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] outline-none"
              />
              <button
                type="button"
                onClick={handleAddItem}
                className="inline-flex items-center gap-2 rounded-full bg-[var(--color-primary)] px-3 py-1.5 text-xs font-semibold text-[#0D0D0D] transition hover:bg-[var(--color-primary-dark)]"
              >
                +
              </button>
            </div>
          </div>

          {itemError ? (
            <p className="mt-3 text-sm text-[var(--color-danger)]">
              {itemError}
            </p>
          ) : null}
        </section>

        <section className="mt-8">
          <div>
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
              What do you already have?
            </h2>
            <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
              Tell us what stock you already have. The AI will only recommend
              what you still need to buy.
            </p>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {sessionIngredients.map((item) => (
              <div
                key={`inventory-${item}`}
                className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4"
              >
                <div className="grid gap-3 sm:grid-cols-[1fr_110px_130px]">
                  <span className="text-sm font-semibold text-[var(--color-text-primary)]">
                    {item}
                  </span>
                  <input
                    type="number"
                    min="0"
                    value={inventory?.[item]?.quantity ?? 0}
                    onChange={(event) =>
                      handleInventoryChange(item, 'quantity', event.target.value)
                    }
                    placeholder="0 (leave blank if none)"
                    className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-input)] px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-border-focus)]"
                  />
                  <select
                    value={inventory?.[item]?.unit ?? INVENTORY_UNITS[0]}
                    onChange={(event) =>
                      handleInventoryChange(item, 'unit', event.target.value)
                    }
                    className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-input)] px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-border-focus)]"
                  >
                    {INVENTORY_UNITS.map((unit) => (
                      <option key={unit} value={unit}>
                        {unit}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
          </div>

          <p className="mt-3 text-sm text-[var(--color-text-muted)]">
            You have stock for {stockCount} of {sessionIngredients.length} items
          </p>
        </section>

        <div className="mt-8">
          <button
            type="button"
            onClick={handleForecast}
            disabled={sessionIngredients.length < 1}
            className="w-full rounded-2xl bg-[var(--color-primary)] px-6 py-4 text-base font-semibold text-[#0D0D0D] shadow-[0_0_30px_var(--color-primary-glow)] transition hover:bg-[var(--color-primary-dark)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            Get Today&apos;s Forecast -
          </button>
        </div>

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
