export default function StallSelector({ stalls, selectedId, onSelect }) {
  return (
    <section className="mt-8">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-(--color-text-primary)">
          Select your stall
        </h2>
        <span className="text-xs uppercase tracking-[0.25em] text-(--color-text-muted)">
          7 types
        </span>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {stalls.map((stall) => {
          const selected = stall.id === selectedId
          return (
            <button
              key={stall.id}
              type="button"
              onClick={() => onSelect(stall.id)}
              aria-pressed={selected}
              className={`group flex flex-col items-start justify-between rounded-lg border px-4 py-5 text-left transition-all duration-300 ${
                selected
                  ? 'border-(--color-primary) bg-(--color-primary-glow) shadow-[0_0_25px_var(--color-primary-glow)]'
                  : 'border-(--color-border) bg-(--color-bg-card) hover:-translate-y-1 hover:border-(--color-primary-dark) hover:bg-(--color-bg-card-hover)'
              }`}
            >
              <span className="text-3xl transition-transform duration-300 group-hover:scale-110">
                {stall.emoji}
              </span>
              <span className="mt-3 text-sm font-semibold text-(--color-text-primary)">
                {stall.name}
              </span>
              <span className="mt-1 text-xs text-(--color-text-muted)">
                {stall.items.length} stock items
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
