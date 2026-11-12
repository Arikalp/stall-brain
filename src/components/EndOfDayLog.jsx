import { useState } from 'react'
import { CheckCircle2, Store, TrendingDown, TrendingUp } from 'lucide-react'
import { submitDailyLog } from '../utils/logsApi'

/**
 * End-of-day sales log (T2.1): the vendor reports what actually happened in
 * two taps per item. Large tap targets, bilingual labels, phone-first layout.
 *
 * Outcomes feed the learning loop (T2.3): sold_out = under-bought,
 * leftover/wasted = over-bought.
 */

const PRIMARY_OPTIONS = [
  {
    outcome: 'sold_out',
    en: 'Sold out early',
    hi: 'जल्दी बिक गया',
    tone: 'danger',
  },
  {
    outcome: 'just_right',
    en: 'Just right',
    hi: 'ठीक-ठाक बिका',
    tone: 'success',
  },
  {
    outcome: 'leftover',
    en: 'Leftover',
    hi: 'बच गया',
    tone: 'neutral',
  },
  {
    outcome: 'wasted',
    en: 'Wasted',
    hi: 'बर्बाद हुआ',
    tone: 'danger',
  },
]

const LEFTOVER_LEVELS = [
  { outcome: 'leftover_small', level: 'small', en: 'A little', hi: 'थोड़ा' },
  { outcome: 'leftover_medium', level: 'medium', en: 'A fair bit', hi: 'काफ़ी' },
  { outcome: 'leftover_large', level: 'large', en: 'A lot', hi: 'बहुत ज़्यादा' },
]

const TONE_STYLES = {
  danger: {
    selected: 'border-[var(--color-danger)] bg-[rgba(248,113,113,0.15)] text-[var(--color-danger)]',
  },
  success: {
    selected:
      'border-[var(--color-success)] bg-[rgba(74,222,128,0.15)] text-[var(--color-success)]',
  },
  neutral: {
    selected: 'border-[var(--color-primary)] bg-[rgba(250,204,21,0.15)] text-yellow-700',
  },
}

export default function EndOfDayLog({ items, date, onLogged, onError }) {
  const [selections, setSelections] = useState({})
  const [customers, setCustomers] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [savedDate, setSavedDate] = useState(null)
  const [biasExplanations, setBiasExplanations] = useState([])
  const [validationError, setValidationError] = useState('')

  const itemList = items ?? []
  const answeredCount = Object.keys(selections).length
  const allAnswered =
    itemList.length > 0 && answeredCount === itemList.length

  const setOutcome = (item, outcome) => {
    setValidationError('')
    setSelections((prev) => ({ ...prev, [item]: outcome }))
  }

  const handleSubmit = async () => {
    if (!allAnswered) {
      setValidationError('Tap an answer for every item - it takes seconds.')
      return
    }

    setSubmitting(true)
    try {
      const parsedCustomers = Number(customers)
      const result = await submitDailyLog({
        date,
        items: itemList.map((item) => {
          const outcome = selections[item]
          const leftover = LEFTOVER_LEVELS.find((entry) => entry.outcome === outcome)
          return {
            item,
            outcome,
            ...(leftover ? { leftoverLevel: leftover.level } : {}),
          }
        }),
        ...(Number.isFinite(parsedCustomers) && customers.trim() !== ''
          ? { customers: parsedCustomers }
          : {}),
      })
      setBiasExplanations(Array.isArray(result?.biasExplanations) ? result.biasExplanations : [])
      setSavedDate(date)
      onLogged?.()
    } catch (error) {
      onError?.(error?.code ?? 'UNKNOWN')
    } finally {
      setSubmitting(false)
    }
  }

  if (savedDate) {
    return (
      <div className="mt-8 rounded-2xl border border-[var(--color-success)] bg-[rgba(74,222,128,0.12)] p-6">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="h-6 w-6 text-[var(--color-success)]" />
          <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">
            Day saved!
          </h3>
        </div>
        <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
          We&apos;ll use this to make tomorrow&apos;s forecast smarter for your
          stall.
        </p>
        {biasExplanations.length > 0 ? (
          <div className="mt-4 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">
              What I&apos;ll adjust tomorrow
            </p>
            {biasExplanations.map((line, index) => (
              <div
                key={index}
                className="flex items-start gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-input)] px-3 py-2 text-xs text-[var(--color-text-secondary)]"
              >
                <span className="mt-0.5 text-[var(--color-primary)]">?</span>
                <span>{line}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div className="mt-8 rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">
            How did today go?
          </h3>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
            Tell us in a few taps - tomorrow&apos;s forecast learns from it.
          </p>
        </div>
        <span className="rounded-full border border-[var(--color-border)] bg-[var(--color-bg-input)] px-3 py-1 text-xs font-semibold text-[var(--color-text-secondary)]">
          {answeredCount}/{itemList.length} done
        </span>
      </div>

      <div className="mt-4 space-y-4">
        {itemList.map((item) => {
          const selected = selections[item]
          const isLeftover = selected === 'leftover'
          return (
            <div
              key={item}
              className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-input)] p-3"
            >
              <p className="text-sm font-semibold text-[var(--color-text-primary)]">
                {item}
              </p>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                {PRIMARY_OPTIONS.map((option) => (
                  <button
                    key={option.outcome}
                    type="button"
                    disabled={submitting}
                    onClick={() => setOutcome(item, option.outcome)}
                    className={`min-h-[48px] rounded-xl border px-3 py-2 text-sm font-semibold transition disabled:opacity-60 ${
                      selected === option.outcome
                        ? TONE_STYLES[option.tone].selected
                        : 'border-[var(--color-border)] bg-[var(--color-bg-card)] text-[var(--color-text-secondary)] hover:border-[var(--color-border-focus)]'
                    }`}
                  >
                    <span className="block">{option.en}</span>
                    <span className="block text-xs opacity-80">{option.hi}</span>
                  </button>
                ))}
              </div>

              {isLeftover ? (
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {LEFTOVER_LEVELS.map((level) => (
                    <button
                      key={level.outcome}
                      type="button"
                      disabled={submitting}
                      onClick={() => setOutcome(item, level.outcome)}
                      className={`min-h-[44px] rounded-xl border px-2 py-2 text-xs font-semibold transition disabled:opacity-60 ${
                        selected === level.outcome
                          ? 'border-[var(--color-primary)] bg-[rgba(250,204,21,0.15)] text-yellow-700'
                          : 'border-[var(--color-border)] bg-[var(--color-bg-card)] text-[var(--color-text-secondary)] hover:border-[var(--color-border-focus)]'
                      }`}
                    >
                      <span className="block">{level.en}</span>
                      <span className="block opacity-80">{level.hi}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          )
        })}
      </div>

      <div className="mt-4 rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-bg-input)] px-3 py-2 focus-within:border-[var(--color-border-focus)]">
        <div className="flex items-center gap-3">
          <Store className="h-4 w-4 shrink-0 text-[var(--color-text-muted)]" />
          <input
            type="number"
            min="0"
            value={customers}
            onChange={(event) => setCustomers(event.target.value)}
            disabled={submitting}
            placeholder="About how many customers came today? (optional)"
            className="w-full bg-transparent py-1 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] outline-none"
          />
        </div>
      </div>

      {validationError ? (
        <p className="mt-3 text-sm text-[var(--color-danger)]">{validationError}</p>
      ) : null}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={submitting}
        className="mt-4 w-full rounded-2xl bg-[var(--color-primary)] px-6 py-3 text-sm font-semibold text-[#0D0D0D] transition hover:bg-[var(--color-primary-dark)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? 'Saving...' : 'Save today\u2019s report'}
      </button>
    </div>
  )
}
