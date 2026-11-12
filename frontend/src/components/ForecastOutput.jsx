import { Lightbulb, RefreshCw, TrendingDown, TrendingUp } from 'lucide-react'

const priorityOrder = {
  essential: 0,
  moderate: 1,
  optional: 2,
}

function getConfidenceStyles(level) {
  if (level?.toLowerCase() === 'high') {
    return 'bg-[rgba(74,222,128,0.15)] text-(--color-success) border-[rgba(74,222,128,0.4)]'
  }
  if (level?.toLowerCase() === 'low') {
    return 'bg-[rgba(248,113,113,0.15)] text-(--color-danger) border-[rgba(248,113,113,0.4)]'
  }
  return 'bg-[rgba(251,191,36,0.15)] text-(--color-warning) border-[rgba(251,191,36,0.4)]'
}

function getPriorityStyles(priority) {
  if (priority === 'essential') {
    return 'bg-[rgba(74,222,128,0.15)] text-(--color-success) border-[rgba(74,222,128,0.4)]'
  }
  if (priority === 'moderate') {
    return 'bg-[rgba(251,191,36,0.15)] text-(--color-warning) border-[rgba(251,191,36,0.4)]'
  }
  return 'bg-[rgba(107,95,82,0.2)] text-(--color-text-secondary) border-(--color-border)'
}

function splitAdvice(specialAdvice) {
  if (!specialAdvice) return { en: '', hi: '' }
  const parts = specialAdvice.split('||').map((part) => part.trim())
  return {
    en: parts[0] || specialAdvice,
    hi: parts[1] || parts[0] || specialAdvice,
  }
}

export default function ForecastOutput({
  forecast,
  demandMultiplier,
  showHindi,
  onToggleHindi,
  onRegenerate,
}) {
  const confidenceStyles = getConfidenceStyles(forecast.confidenceLevel)
  const procurementList = [...(forecast.procurementList || [])].sort((a, b) => {
    return (priorityOrder[a.priority] ?? 3) - (priorityOrder[b.priority] ?? 3)
  })
  const sufficientStockItems = Array.isArray(forecast.sufficientStockItems)
    ? forecast.sufficientStockItems
    : []

  const { en: adviceEn, hi: adviceHi } = splitAdvice(forecast.specialAdvice)
  const summaryText = showHindi
    ? forecast.hindiSummary || forecast.summary
    : forecast.summary || 'Forecast ready for today.'
  const adviceText = showHindi ? adviceHi || adviceEn : adviceEn
  const expectedCustomers = Number.isFinite(forecast.expectedCustomers)
    ? Math.round(forecast.expectedCustomers)
    : '--'

  const trendUp = demandMultiplier >= 1.15
  const trendDown = demandMultiplier <= 0.9

  return (
    <section className="mt-8">
      <div className="rounded-3xl border border-(--color-border) border-l-[3px] border-l-(--color-primary) bg-(--color-bg-card) p-6 shadow-[0_0_40px_var(--color-primary-glow)]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.25em] text-(--color-text-muted)">
              Today&apos;s Forecast
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-(--color-text-primary)">
              {summaryText}
            </h2>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onToggleHindi}
              className="rounded-full border border-(--color-border) bg-transparent px-4 py-2 text-sm font-semibold text-(--color-text-secondary) transition hover:bg-(--color-bg-card-hover)"
            >
              {showHindi ? 'Show English' : 'हिंदी में देखें'}
            </button>
            <button
              type="button"
              onClick={onRegenerate}
              className="inline-flex items-center gap-2 rounded-full border border-(--color-border) bg-transparent px-4 py-2 text-sm font-semibold text-(--color-text-secondary) transition hover:bg-(--color-bg-card-hover)"
            >
              <RefreshCw size={16} />
              Regenerate
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border border-(--color-border) bg-(--color-bg-card) p-5">
            <div className="flex items-center gap-3">
              <div className="text-4xl font-bold text-(--color-text-primary)">
                {expectedCustomers}
              </div>
              <div className="text-sm text-(--color-text-secondary)">
                expected customers
              </div>
            </div>
            <div className="mt-4 flex items-center gap-2 text-sm text-(--color-text-secondary)">
              {trendUp ? (
                <TrendingUp className="h-5 w-5 text-(--color-success)" />
              ) : trendDown ? (
                <TrendingDown className="h-5 w-5 text-(--color-danger)" />
              ) : null}
              Demand multiplier: {demandMultiplier.toFixed(2)}x
            </div>
          </div>

          <div className="rounded-2xl border border-(--color-border) bg-(--color-bg-card) p-5">
            <p className="text-sm text-(--color-text-secondary)">Peak hours</p>
            <div className="mt-3 inline-flex rounded-full border border-(--color-border) bg-(--color-bg-input) px-4 py-2 text-sm font-semibold text-(--color-text-primary)">
              {forecast.peakHours}
            </div>
            <p className="mt-4 text-sm text-(--color-text-muted)">
              Confidence:{' '}
              <span className="font-semibold text-(--color-text-primary)">
                {forecast.confidenceReason}
              </span>
            </p>
          </div>

          <div className="rounded-2xl border border-(--color-border) bg-(--color-bg-card) p-5">
            <p className="text-sm text-(--color-text-secondary)">Confidence</p>
            <div className={`mt-3 inline-flex items-center rounded-full border px-4 py-2 text-sm font-semibold ${confidenceStyles}`}>
              {forecast.confidenceLevel}
            </div>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-(--color-border) bg-(--color-bg-card) p-6">
          <h3 className="text-lg font-semibold text-(--color-text-primary)">
            Procurement list
          </h3>
          {procurementList.length ? (
            <div className="mt-4 overflow-hidden rounded-xl border border-(--color-border)">
              <div className="grid grid-cols-[1.4fr_1fr_1fr_1fr] gap-3 border-b border-(--color-border) bg-(--color-bg-input) px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-(--color-text-muted)">
                <span>Item</span>
                <span>Total Needed</span>
                <span>You Have</span>
                <span>Buy Today</span>
              </div>
              {procurementList.map((item, index) => {
                const rowClass =
                  index % 2 === 0
                    ? 'bg-(--color-bg-card)'
                    : 'bg-(--color-bg-input)'
                const totalNeeded = item.totalNeeded ?? item.quantity ?? '--'
                const alreadyHave = item.alreadyHave ?? '--'
                const toBuy = item.toBuy ?? '--'
                const priority = item.priority ?? 'moderate'

                return (
                  <div
                    key={`${item.item}-${index}`}
                    className={`grid grid-cols-[1.4fr_1fr_1fr_1fr] gap-3 px-4 py-3 ${rowClass}`}
                  >
                    <div>
                      <p className="text-sm font-semibold text-(--color-text-primary)">
                        {item.item}
                      </p>
                      {item.note ? (
                        <p className="mt-1 text-xs text-(--color-text-muted)">
                          {item.note}
                        </p>
                      ) : null}
                      <span
                        className={`mt-2 inline-flex rounded-full border px-3 py-1 text-[0.65rem] font-semibold ${getPriorityStyles(priority)}`}
                      >
                        {priority}
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-(--color-text-primary)">
                      {totalNeeded}
                    </p>
                    <p className="text-sm font-semibold text-(--color-text-primary)">
                      {alreadyHave}
                    </p>
                    <p className="text-sm font-semibold text-(--color-text-primary)">
                      {toBuy}
                    </p>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="mt-4 text-sm text-(--color-text-muted)">
              Procurement list unavailable. Regenerate to fetch a fresh plan.
            </p>
          )}

          {sufficientStockItems.length ? (
            <div className="mt-4 rounded-2xl border border-[rgba(74,222,128,0.4)] bg-[rgba(74,222,128,0.12)] p-4">
              <p className="text-sm font-semibold text-(--color-success)">
                ✅ Sufficient Stock — no purchase needed
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {sufficientStockItems.map((item) => (
                  <span
                    key={item}
                    className="rounded-full border border-[rgba(74,222,128,0.4)] bg-[rgba(74,222,128,0.16)] px-3 py-1 text-xs font-semibold text-(--color-success)"
                  >
                    {item}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="mt-6 rounded-2xl border border-(--color-border) bg-[rgba(245,158,11,0.12)] p-5">
          <div className="flex items-start gap-3">
            <Lightbulb className="h-6 w-6 text-(--color-primary)" />
            <div>
              <p className="text-sm font-semibold text-(--color-text-primary)">
                Special advice
              </p>
              <p className="mt-1 text-sm text-(--color-text-secondary)">
                {adviceText}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
