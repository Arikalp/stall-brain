import { Users } from 'lucide-react'

export default function GroupBuyingCard({
  data,
  lane,
  optedIn,
  loading,
  onToggleOptIn,
  disabled,
}) {
  const suggestions = data?.suggestions ?? []

  return (
    <section className="mt-8 rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-input)] text-[var(--color-primary)]">
            <Users size={18} />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-text-muted)]">
              Nearby Group Buying ({lane || 'Hazratganj'})
            </p>
            <h3 className="mt-1 text-base font-semibold text-[var(--color-text-primary)]">
              Pool mandi orders anonymously with vendors in your lane
            </h3>
            <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
              Only total item quantities are shared — your stall name and phone stay private.
            </p>
          </div>
        </div>

        <button
          type="button"
          disabled={loading || disabled}
          onClick={() => onToggleOptIn(!optedIn)}
          className={`rounded-full border px-4 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
            optedIn
              ? 'border-[var(--color-success)] bg-[rgba(74,222,128,0.14)] text-[var(--color-success)]'
              : 'border-[var(--color-primary)] bg-[rgba(250,204,21,0.12)] text-[var(--color-text-primary)] hover:bg-[rgba(250,204,21,0.22)]'
          }`}
        >
          {loading
            ? 'Updating...'
            : optedIn
              ? 'Opted in (Tap to leave)'
              : 'Share my list & join group'}
        </button>
      </div>

      {suggestions.length > 0 ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {suggestions.slice(0, 6).map((entry) => (
            <div
              key={entry.item}
              className="flex items-center justify-between rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-input)] px-4 py-2.5 text-xs"
            >
              <div>
                <p className="font-semibold text-[var(--color-text-primary)]">
                  {entry.vendorCount} vendor{entry.vendorCount === 1 ? '' : 's'} nearby need{' '}
                  <span className="text-[var(--color-primary)]">{entry.item}</span> today
                </p>
                <p className="mt-0.5 text-[var(--color-text-muted)]">
                  Combined demand: {entry.totalQuantity} {entry.unit}
                </p>
              </div>
              {entry.youJoined ? (
                <span className="rounded-full border border-[var(--color-success)] px-2 py-0.5 text-[10px] font-semibold text-[var(--color-success)]">
                  Joined
                </span>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-xs text-[var(--color-text-muted)]">
          No shared lane orders posted yet today for {lane || 'Hazratganj'}. Opt in after your forecast to see bulk-buy matches.
        </p>
      )}
    </section>
  )
}

