import { CalendarDays, CloudSun, Users } from 'lucide-react'

function getImpactBadge(multiplier) {
  if (multiplier >= 1.2) {
    return {
      label: 'High Demand',
      color:
        'bg-[rgba(74,222,128,0.15)] text-(--color-success) border-[rgba(74,222,128,0.4)]',
    }
  }
  if (multiplier <= 0.9) {
    return {
      label: 'Low Demand',
      color:
        'bg-[rgba(248,113,113,0.15)] text-(--color-danger) border-[rgba(248,113,113,0.4)]',
    }
  }
  return {
    label: 'Normal',
    color:
      'bg-[rgba(251,191,36,0.15)] text-(--color-warning) border-[rgba(251,191,36,0.4)]',
  }
}

function getCardBorder(multiplier) {
  if (multiplier >= 1.2) {
    return 'border-l-4 border-(--color-border) border-l-(--color-success)'
  }
  if (multiplier <= 0.9) {
    return 'border-l-4 border-(--color-border) border-l-(--color-danger)'
  }
  return 'border-l-4 border-(--color-border) border-l-(--color-warning)'
}

export default function SignalPanel({
  weather,
  weatherSignal,
  eventSummary,
  eventMultiplier,
  dayName,
  dayMultiplier,
  fallbackWeather,
  loading,
}) {
  if (loading) {
    return (
      <section className="mt-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-(--color-text-primary)">
            Live demand signals
          </h2>
          <span className="text-xs uppercase tracking-[0.2em] text-(--color-text-muted)">
            Updating...
          </span>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          {[0, 1, 2].map((index) => (
            <div
              key={index}
              className="rounded-2xl border border-(--color-border) bg-(--color-bg-card) p-5"
            >
              <div className="space-y-4 animate-pulse">
                <div className="h-4 w-24 rounded bg-(--color-bg-input)" />
                <div className="h-8 w-20 rounded bg-(--color-bg-input)" />
                <div className="h-3 w-32 rounded bg-(--color-bg-input)" />
                <div className="h-3 w-40 rounded bg-(--color-bg-input)" />
              </div>
            </div>
          ))}
        </div>
      </section>
    )
  }

  const safeWeather = weather ?? { temperature: 0 }
  const safeSignal = weatherSignal ?? {
    label: 'Weather Unknown',
    footfallImpact: 1,
    recommendation: 'Plan for regular demand.',
  }

  const weatherBadge = getImpactBadge(safeSignal.footfallImpact)
  const eventBadge = getImpactBadge(eventMultiplier)
  const dayBadge = getImpactBadge(dayMultiplier)
  const weatherBorder = getCardBorder(safeSignal.footfallImpact)
  const eventBorder = getCardBorder(eventMultiplier)
  const dayBorder = getCardBorder(dayMultiplier)

  return (
    <section className="mt-8">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-(--color-text-primary)">
          Live demand signals
        </h2>
        {fallbackWeather ? (
          <span className="text-xs text-(--color-text-secondary)">
            Using fallback weather
          </span>
        ) : null}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className={`rounded-2xl ${weatherBorder} bg-(--color-bg-card) p-5`}>
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm text-(--color-text-secondary)">
                <CloudSun size={18} className="text-(--color-primary)" />
                Weather
              </div>
              <div className="mt-3 text-3xl font-semibold text-(--color-text-primary)">
                {Math.round(safeWeather.temperature)}°C
              </div>
              <div className="mt-2 text-sm text-(--color-text-secondary)">
                {safeSignal.label}
              </div>
            </div>
            <span
              className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${weatherBadge.color}`}
            >
              {weatherBadge.label}
            </span>
          </div>
          <p className="mt-4 text-sm text-(--color-text-muted)">
            {safeSignal.recommendation}
          </p>
        </div>

        <div className={`rounded-2xl ${eventBorder} bg-(--color-bg-card) p-5`}>
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm text-(--color-text-secondary)">
                <CalendarDays size={18} className="text-(--color-primary)" />
                Events
              </div>
              <div className="mt-3 text-lg font-semibold text-(--color-text-primary)">
                {eventSummary || 'Regular Day'}
              </div>
              <div className="mt-2 text-sm text-(--color-text-muted)">
                Lucknow calendar
              </div>
            </div>
            <span
              className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${eventBadge.color}`}
            >
              {eventBadge.label}
            </span>
          </div>
          <p className="mt-4 text-sm text-(--color-text-muted)">
            Event impact multiplier: {eventMultiplier.toFixed(2)}x
          </p>
        </div>

        <div className={`rounded-2xl ${dayBorder} bg-(--color-bg-card) p-5`}>
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm text-(--color-text-secondary)">
                <Users size={18} className="text-(--color-primary)" />
                {dayName}
              </div>
              <div className="mt-3 text-lg font-semibold text-(--color-text-primary)">
                Footfall Trend
              </div>
              <div className="mt-2 text-sm text-(--color-text-muted)">
                Weekly pattern for {dayName}
              </div>
            </div>
            <span
              className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${dayBadge.color}`}
            >
              {dayBadge.label}
            </span>
          </div>
          <p className="mt-4 text-sm text-(--color-text-muted)">
            Day-of-week multiplier: {dayMultiplier.toFixed(2)}x
          </p>
        </div>
      </div>
    </section>
  )
}
