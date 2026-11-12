import { useState } from 'react'
import { Check, RotateCcw } from 'lucide-react'

/**
 * Human-in-the-loop approval UI (T1.8). Shows the agent's proposed plan with
 * editable "to buy" quantities. Approve sends the edited plan back through
 * POST /api/forecast/resume; Reject asks the agent to regenerate.
 *
 * Remount with a new `key` when a regenerated plan arrives so the editable
 * values reset to the new plan.
 */
export default function PlanEditor({ plan, busy = false, onApprove, onReject }) {
  const items = plan?.procurementList ?? []

  const [quantities, setQuantities] = useState(() =>
    Object.fromEntries(items.map((item) => [item.item, String(item.toBuy ?? '')])),
  )
  const [validationError, setValidationError] = useState('')

  const handleQuantityChange = (itemName, value) => {
    setValidationError('')
    setQuantities((prev) => ({ ...prev, [itemName]: value }))
  }

  const handleApprove = () => {
    for (const item of items) {
      const raw = (quantities[item.item] ?? '').trim()
      const quantity = Number(raw)
      if (!raw || !Number.isFinite(quantity) || quantity < 0) {
        setValidationError(`Enter a valid quantity for ${item.item}.`)
        return
      }
    }

    const editedPlan = {
      ...plan,
      procurementList: items.map((item) => ({
        ...item,
        toBuy: (quantities[item.item] ?? '').trim(),
      })),
    }
    onApprove?.(editedPlan)
  }

  if (!plan) return null

  return (
    <div className="mt-8 rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">
            Review your plan before buying
          </h3>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
            The AI drafted these quantities. Adjust anything, then approve - or
            ask it to try again.
          </p>
        </div>
        <span className="rounded-full border border-[var(--color-border)] bg-[var(--color-bg-input)] px-3 py-1 text-xs font-semibold text-[var(--color-text-secondary)]">
          {plan.expectedCustomers} customers expected
        </span>
      </div>

      <div className="mt-4 space-y-3">
        {items.map((item) => (
          <div
            key={item.item}
            className="grid gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-input)] px-4 py-3 sm:grid-cols-[1fr_auto_auto]"
          >
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-[var(--color-text-primary)]">
                  {item.item}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                    item.priority === 'essential'
                      ? 'bg-[rgba(248,113,113,0.15)] text-[var(--color-danger)]'
                      : item.priority === 'moderate'
                        ? 'bg-[rgba(250,204,21,0.15)] text-yellow-600'
                        : 'bg-[var(--color-bg-card)] text-[var(--color-text-muted)]'
                  }`}
                >
                  {item.priority}
                </span>
              </div>
              <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                Need {item.totalNeeded} · have {item.alreadyHave}
                {item.note ? ` · ${item.note}` : ''}
              </p>
            </div>
            <input
              type="number"
              min="0"
              step="any"
              value={quantities[item.item] ?? ''}
              onChange={(event) => handleQuantityChange(item.item, event.target.value)}
              disabled={busy}
              aria-label={`Quantity to buy for ${item.item}`}
              className="w-28 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-border-focus)] disabled:opacity-60"
            />
            <span className="self-center text-xs text-[var(--color-text-muted)]">
              {item.unit}
            </span>
          </div>
        ))}

        {items.length === 0 ? (
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-input)] px-4 py-3 text-sm text-[var(--color-text-muted)]">
            No purchases needed today - your stock covers the plan.
          </div>
        ) : null}
      </div>

      {validationError ? (
        <p className="mt-3 text-sm text-[var(--color-danger)]">{validationError}</p>
      ) : null}

      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={handleApprove}
          disabled={busy}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-[var(--color-primary)] px-6 py-3 text-sm font-semibold text-[#0D0D0D] transition hover:bg-[var(--color-primary-dark)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Check className="h-4 w-4" />
          Approve &amp; save plan
        </button>
        <button
          type="button"
          onClick={onReject}
          disabled={busy}
          className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[var(--color-border)] bg-transparent px-6 py-3 text-sm font-semibold text-[var(--color-text-secondary)] transition hover:bg-[var(--color-bg-card-hover)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RotateCcw className="h-4 w-4" />
          Not right - regenerate
        </button>
      </div>
    </div>
  )
}
