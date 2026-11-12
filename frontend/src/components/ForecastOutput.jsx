import { useEffect, useState } from 'react'
import { IndianRupee, Lightbulb, RefreshCw, Square, TrendingDown, TrendingUp, Volume2 } from 'lucide-react'

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
  const [speaking, setSpeaking] = useState(false)
  const speechSupported =
    typeof window !== 'undefined' && 'speechSynthesis' in window

  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel()
      }
    }
  }, [forecast])

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
  const financials = forecast.financials ?? null
  const formatInr = (value) =>
    Number.isFinite(Number(value)) ? `₹${Math.round(Number(value)).toLocaleString('en-IN')}` : '--'

  const handleToggleSpeak = () => {
    if (!speechSupported) return
    const synth = window.speechSynthesis

    if (speaking) {
      synth.cancel()
      setSpeaking(false)
      return
    }

    synth.cancel()
    const buyText = procurementList.length
      ? `आज खरीदना है: ${procurementList
          .slice(0, 5)
          .map((item) => `${item.item} ${item.toBuy}`)
          .join(', ')}।`
      : ''
    const spokenText = [
      forecast.hindiSummary || forecast.summary,
      buyText,
      adviceHi,
    ]
      .filter(Boolean)
      .join(' ')

    const utterance = new SpeechSynthesisUtterance(spokenText)
    utterance.lang = 'hi-IN'
    utterance.rate = 0.95
    const voices = synth.getVoices?.() ?? []
    const hiVoice = voices.find((voice) =>
      voice.lang?.toLowerCase().startsWith('hi'),
    )
    if (hiVoice) {
      utterance.voice = hiVoice
    }
    utterance.onend = () => setSpeaking(false)
    utterance.onerror = () => setSpeaking(false)
    setSpeaking(true)
    synth.speak(utterance)
  }

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
          <div className="flex flex-wrap items-center gap-3">
            {speechSupported ? (
              <button
                type="button"
                onClick={handleToggleSpeak}
                className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition ${
                  speaking
                    ? 'border-(--color-danger) bg-[rgba(248,113,113,0.15)] text-(--color-danger)'
                    : 'border-(--color-primary) bg-[rgba(250,204,21,0.12)] text-(--color-text-primary) hover:bg-[rgba(250,204,21,0.2)]'
                }`}
              >
                {speaking ? <Square size={14} /> : <Volume2 size={16} />}
                {speaking ? 'रोकें (Stop)' : 'सुनें (Listen)'}
              </button>
            ) : null}
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

        {financials ? (
          <div className="mt-6 rounded-2xl border border-(--color-border) bg-(--color-bg-input) p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <IndianRupee className="h-4 w-4 text-(--color-primary)" />
                <h3 className="text-sm font-semibold uppercase tracking-[0.15em] text-(--color-text-secondary)">
                  Estimated Cost, Revenue &amp; Profit
                </h3>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {financials.budgetInr != null ? (
                  <span
                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                      financials.withinBudget
                        ? 'border-[rgba(74,222,128,0.4)] bg-[rgba(74,222,128,0.15)] text-(--color-success)'
                        : 'border-[rgba(248,113,113,0.4)] bg-[rgba(248,113,113,0.15)] text-(--color-danger)'
                    }`}
                  >
                    {financials.withinBudget
                      ? `Within ${formatInr(financials.budgetInr)} budget`
                      : `Over ${formatInr(financials.budgetInr)} budget`}
                  </span>
                ) : null}
                {financials.isMockPricing ? (
                  <span className="rounded-full border border-[rgba(251,191,36,0.4)] bg-[rgba(251,191,36,0.12)] px-3 py-1 text-xs font-semibold text-(--color-warning)">
                    Mock mandi prices (update in Profile)
                  </span>
                ) : null}
              </div>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <div className="rounded-xl border border-(--color-border) bg-(--color-bg-card) p-4">
                <p className="text-xs text-(--color-text-muted)">Buy Cost Today</p>
                <p className="mt-1 text-2xl font-bold text-(--color-text-primary)">
                  {formatInr(financials.totalCostInr)}
                </p>
                {financials.budgetConstrained ? (
                  <p className="mt-1 text-xs text-(--color-warning)">
                    Prioritized high-margin items for budget
                  </p>
                ) : null}
              </div>
              <div className="rounded-xl border border-(--color-border) bg-(--color-bg-card) p-4">
                <p className="text-xs text-(--color-text-muted)">Expected Revenue</p>
                <p className="mt-1 text-2xl font-bold text-(--color-text-primary)">
                  {formatInr(financials.expectedRevenueInr)}
                </p>
              </div>
              <div className="rounded-xl border border-(--color-border) bg-(--color-bg-card) p-4">
                <p className="text-xs text-(--color-text-muted)">Expected Profit &amp; Margin</p>
                <p className="mt-1 text-2xl font-bold text-(--color-success)">
                  {formatInr(financials.expectedProfitInr)}
                </p>
                <p className="mt-1 text-xs text-(--color-text-secondary)">
                  {financials.marginPercent}% gross margin
                </p>
              </div>
            </div>
          </div>
        ) : null}

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
                      {financials?.items?.[item.item]?.costInr != null &&
                      financials.items[item.item].costInr > 0 ? (
                        <span className="mt-1 block text-xs font-normal text-(--color-text-muted)">
                          Est. {formatInr(financials.items[item.item].costInr)}
                        </span>
                      ) : null}
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

          {Array.isArray(forecast.perishableNotes) && forecast.perishableNotes.length > 0 ? (
            <div className="mt-4 rounded-2xl border border-[rgba(251,191,36,0.35)] bg-[rgba(251,191,36,0.08)] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-(--color-warning)">
                Shelf-Life &amp; Spoilage Protection
              </p>
              <ul className="mt-2 space-y-1 text-xs text-(--color-text-secondary)">
                {forecast.perishableNotes.map((note, idx) => (
                  <li key={idx}>• {note}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        {forecast.tomorrowOutlook ? (
          <div className="mt-6 rounded-2xl border border-(--color-border) bg-(--color-bg-input) p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-(--color-primary)">
              Tomorrow&apos;s Outlook (3-Day Lookahead)
            </p>
            <p className="mt-2 text-sm text-(--color-text-primary)">
              {showHindi
                ? String(forecast.tomorrowOutlook).split('||').pop()?.trim()
                : String(forecast.tomorrowOutlook).split('||')[0]?.trim()}
            </p>
          </div>
        ) : null}

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
