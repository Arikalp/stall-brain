import { useEffect, useState } from 'react'
import { CheckCircle2, Loader2 } from 'lucide-react'

const DEFAULT_STEPS = [
  '📡 Fetching Lucknow weather data...',
  '📅 Checking local events calendar...',
  '📊 Analyzing footfall patterns...',
  '🧠 AI is calculating your forecast...',
  '✅ Forecast ready!',
]

/**
 * Progress display. Two modes:
 *
 * - `steps` prop given: renders the LIVE agent steps streamed from the
 *   backend (T1.10). Earlier lines render as done, the newest as active.
 * - no `steps`: falls back to the timed placeholder progression.
 */
export default function LoadingState({ active, steps: liveSteps }) {
  const [fallbackIndex, setFallbackIndex] = useState(-1)

  const hasLive = Array.isArray(liveSteps) && liveSteps.length > 0

  useEffect(() => {
    if (!active || hasLive) {
      setFallbackIndex(-1)
      return
    }

    setFallbackIndex(0)
    const interval = setInterval(() => {
      setFallbackIndex((prev) => {
        if (prev >= DEFAULT_STEPS.length) {
          clearInterval(interval)
          return prev
        }
        return prev + 1
      })
    }, 600)

    return () => clearInterval(interval)
  }, [active, hasLive])

  if (!active) return null

  const steps = hasLive ? liveSteps : DEFAULT_STEPS

  return (
    <div className="mt-8 rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-6">
      <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">
        Bazaar Brain is working...
      </h3>
      <div className="mt-4 space-y-3">
        {steps.map((step, index) => {
          const isActive = hasLive
            ? index === steps.length - 1
            : index === fallbackIndex && fallbackIndex < DEFAULT_STEPS.length
          const isDone = hasLive
            ? index < steps.length - 1
            : index < fallbackIndex

          const textColor = isActive
            ? 'text-[var(--color-primary)] animate-pulse'
            : isDone
              ? 'text-[var(--color-text-primary)]'
              : 'text-[var(--color-text-muted)]'

          return (
            <div
              key={`${index}-${step}`}
              className="flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-input)] px-4 py-3"
            >
              {isActive ? (
                <Loader2 className="h-5 w-5 animate-spin text-[var(--color-primary)]" />
              ) : (
                <CheckCircle2 className="h-5 w-5 text-[var(--color-success)]" />
              )}
              <span className={`text-sm ${textColor}`}>{step}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
