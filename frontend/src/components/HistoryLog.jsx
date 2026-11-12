import { ChevronDown, ChevronUp, Clock } from 'lucide-react'

function getFeedbackBadge(feedback) {
  if (feedback === 'up') {
    return {
      label: 'Actual: Accurate',
      color: 'border-(--color-success) bg-[rgba(74,222,128,0.12)] text-(--color-success)',
    }
  }
  if (feedback === 'down') {
    return {
      label: 'Actual: Lower than expected',
      color: 'border-(--color-danger) bg-[rgba(248,113,113,0.12)] text-(--color-danger)',
    }
  }
  return {
    label: 'Actual: Pending',
    color: 'border-(--color-border) bg-(--color-bg-input) text-(--color-text-secondary)',
  }
}

export default function HistoryLog({ history, collapsed, onToggle }) {
  const hasItems = history.length > 0

  return (
    <section className="mt-10">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between rounded-2xl border border-(--color-border) bg-(--color-bg-card) px-5 py-4 text-left transition hover:border-(--color-primary)"
        aria-expanded={!collapsed}
      >
        <div>
          <p className="text-sm font-semibold text-(--color-text-primary)">
            Past Forecasts
          </p>
          <p className="mt-1 text-xs text-(--color-text-muted)">
            Last 5 predictions
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-(--color-text-muted)">
          <Clock className="h-4 w-4" />
          {collapsed ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
        </div>
      </button>

      {!collapsed ? (
        <div className="mt-4 space-y-3">
          {hasItems ? (
            history.map((entry) => {
              const badge = getFeedbackBadge(entry.feedback)
              const expected = Number.isFinite(entry.expectedCustomers)
                ? Math.round(entry.expectedCustomers)
                : '--'
              const demandValue = Number.isFinite(Number(entry.demandMultiplier))
                ? Number(entry.demandMultiplier).toFixed(2)
                : '1.00'
              return (
                <div
                  key={entry.id}
                  className="rounded-2xl border border-(--color-border) bg-(--color-bg-card) p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-(--color-text-primary)">
                        {entry.stallName}
                      </p>
                      <p className="text-xs text-(--color-text-muted)">
                        {entry.dateLabel}
                      </p>
                    </div>
                    <span className="rounded-full border border-(--color-border) bg-(--color-bg-input) px-3 py-1 text-xs font-semibold text-(--color-text-primary)">
                      Expected: {expected}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
                    <span className="rounded-full border border-(--color-border) bg-(--color-bg-input) px-3 py-1 text-(--color-text-secondary)">
                      Demand x{demandValue}
                    </span>
                    <span
                      className={`rounded-full border px-3 py-1 ${badge.color}`}
                    >
                      {badge.label}
                    </span>
                    {entry.outcomeSummary ? (
                      <span className="rounded-full border border-[var(--color-success)] bg-[rgba(74,222,128,0.12)] px-3 py-1 text-[var(--color-success)]">
                        {entry.outcomeSummary}
                      </span>
                    ) : null}
                  </div>
                </div>
              )
            })
          ) : (
            <div className="rounded-2xl border border-(--color-border) bg-(--color-bg-card) p-4 text-sm text-(--color-text-muted)">
              No forecasts yet. Your history will appear here after the first run.
            </div>
          )}
        </div>
      ) : null}
    </section>
  )
}
