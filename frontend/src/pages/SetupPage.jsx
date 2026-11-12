import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { GripVertical, Plus, X } from 'lucide-react'
import { signOut } from 'firebase/auth'
import Header from '../components/Header'
import StallSelector from '../components/StallSelector'
import { stalls } from '../data/stalls'
import { loadSelection, saveSelection } from '../utils/selectionStorage'
import { auth } from '../utils/firebase'

const steps = [
  { id: 1, label: 'Choose Stall' },
  { id: 2, label: 'Edit Items' },
  { id: 3, label: 'Get Forecast' },
]

export default function SetupPage() {
  const navigate = useNavigate()
  const storedSelection = useMemo(() => loadSelection(), [])
  const [selectedStallId, setSelectedStallId] = useState(
    storedSelection?.stallId ?? null,
  )
  const [items, setItems] = useState(() => {
    if (!storedSelection?.stallId) return []
    return storedSelection.items
  })
  const [confirmed, setConfirmed] = useState(
    Boolean(storedSelection?.confirmed),
  )
  const [newItem, setNewItem] = useState('')
  const [error, setError] = useState('')

  const selectedStall = stalls.find((stall) => stall.id === selectedStallId)
  const itemCountLabel = `${items.length} items in your stall`
  const step1Complete = Boolean(selectedStallId)
  const step2Complete = Boolean(selectedStallId && confirmed)
  const activeStep = step2Complete ? 3 : step1Complete ? 2 : 1

  useEffect(() => {
    if (!selectedStallId) return
    saveSelection({ stallId: selectedStallId, items, confirmed })
  }, [selectedStallId, items, confirmed])

  const handleSelectStall = (stallId) => {
    const stall = stalls.find((entry) => entry.id === stallId)
    if (!stall) return
    setSelectedStallId(stallId)
    setItems([...stall.items])
    setConfirmed(false)
    setError('')
    saveSelection({ stallId, items: stall.items, confirmed: false })
  }

  const handleItemChange = (index, value) => {
    setItems((prev) => {
      const next = [...prev]
      next[index] = value
      return next
    })
    setConfirmed(false)
    setError('')
  }

  const handleRemoveItem = (index) => {
    setItems((prev) => prev.filter((_, idx) => idx !== index))
    setConfirmed(false)
    setError('')
  }

  const handleAddItem = () => {
    const trimmed = newItem.trim()
    if (!trimmed) return
    setItems((prev) => [...prev, trimmed])
    setNewItem('')
    setConfirmed(false)
    setError('')
  }

  const handleResetDefaults = () => {
    if (!selectedStall) return
    setItems([...selectedStall.items])
    setConfirmed(false)
    setError('')
  }

  const handleConfirm = () => {
    if (!selectedStallId) return
    if (items.length < 1) {
      setError('Add at least one item before continuing.')
      return
    }
    const cleanedItems = items
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
    if (cleanedItems.length < 1) {
      setError('Add at least one item before continuing.')
      return
    }

    setItems(cleanedItems)
    saveSelection({ stallId: selectedStallId, items: cleanedItems, confirmed: true })
    setConfirmed(true)
    navigate('/forecast')
  }

  const handleLogout = async () => {
    await signOut(auth)
    navigate('/login')
  }

  return (
    <main className="relative min-h-screen">
      <div className="relative z-10 mx-auto flex min-h-screen max-w-6xl flex-col px-4 pb-12 pt-8 sm:px-6 lg:px-10">
        <Header />

        <div className="mt-6 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] px-5 py-4">
          <div className="grid gap-4 md:grid-cols-3">
            {steps.map((step) => {
              const isComplete =
                step.id === 1 ? step1Complete : step.id === 2 ? step2Complete : false
              const isActive = step.id === activeStep
              return (
                <div
                  key={step.id}
                  className={`flex items-center gap-3 rounded-lg border px-4 py-3 ${
                    isComplete
                      ? 'border-[var(--color-success)] bg-[rgba(74,222,128,0.12)]'
                      : isActive
                        ? 'border-[var(--color-primary)] bg-[var(--color-primary-glow)]'
                        : 'border-[var(--color-border)] bg-[var(--color-bg-input)]'
                  }`}
                >
                  <span
                    className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                      isComplete
                        ? 'bg-[var(--color-success)] text-[#0D0D0D]'
                        : isActive
                          ? 'bg-[var(--color-primary)] text-[#0D0D0D]'
                          : 'bg-[var(--color-border)] text-[var(--color-text-secondary)]'
                    }`}
                  >
                    {step.id}
                  </span>
                  <span className="text-sm font-semibold text-[var(--color-text-primary)]">
                    {step.label}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <Link
            to="/"
            className="inline-flex items-center rounded-full border border-[var(--color-border)] bg-transparent px-4 py-2 text-sm font-semibold text-[var(--color-text-secondary)] transition hover:bg-[var(--color-bg-card-hover)]"
          >
            Back
          </Link>
          <div className="flex items-center gap-3">
            <span className="text-xs uppercase tracking-[0.2em] text-[var(--color-text-muted)]">
              Setup
            </span>
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center rounded-full border border-[var(--color-border)] bg-transparent px-4 py-2 text-xs font-semibold text-[var(--color-text-secondary)] transition hover:bg-[var(--color-bg-card-hover)]"
            >
              Logout
            </button>
          </div>
        </div>

        <StallSelector
          stalls={stalls}
          selectedId={selectedStallId}
          onSelect={handleSelectStall}
        />

        {selectedStall ? (
          <section className="mt-8">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
                  Edit your items
                </h2>
                <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                  {itemCountLabel}
                </p>
              </div>
              <button
                type="button"
                onClick={handleResetDefaults}
                className="text-sm font-semibold text-[var(--color-primary)] transition hover:text-[var(--color-primary-dark)]"
              >
                Reset to defaults
              </button>
            </div>

            <div className="mt-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4">
              <div className="max-h-72 space-y-3 overflow-y-auto pr-2">
                {items.length ? (
                  items.map((item, index) => (
                    <div
                      key={`${item}-${index}`}
                      className="flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-input)] px-3 py-2 focus-within:border-[var(--color-border-focus)]"
                    >
                      <GripVertical className="h-4 w-4 text-[var(--color-text-muted)]" />
                      <input
                        value={item}
                        onChange={(event) =>
                          handleItemChange(index, event.target.value)
                        }
                        className="flex-1 bg-transparent text-sm text-[var(--color-text-primary)] outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(index)}
                        className="rounded-full border border-transparent p-1 text-[var(--color-text-muted)] transition hover:border-[var(--color-danger)] hover:text-[var(--color-danger)]"
                        aria-label="Remove item"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-input)] px-4 py-3 text-sm text-[var(--color-text-muted)]">
                    No items yet. Add at least one item to continue.
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
                  placeholder="Add a new item..."
                  className="flex-1 bg-transparent text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] outline-none"
                />
                <button
                  type="button"
                  onClick={handleAddItem}
                  className="inline-flex items-center gap-2 rounded-full bg-[var(--color-primary)] px-3 py-1.5 text-xs font-semibold text-[#0D0D0D] transition hover:bg-[var(--color-primary-dark)]"
                >
                  <Plus className="h-4 w-4" />
                  Add Item
                </button>
              </div>
            </div>
          </section>
        ) : null}

        {error ? (
          <p className="mt-4 text-sm text-[var(--color-danger)]">{error}</p>
        ) : null}

        <div className="mt-8 flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!selectedStallId}
            className="inline-flex items-center justify-center rounded-full bg-[var(--color-primary)] px-6 py-3 text-base font-semibold text-[#0D0D0D] shadow-[0_0_25px_var(--color-primary-glow)] transition hover:bg-[var(--color-primary-dark)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            Confirm and Forecast
          </button>
          <p className="text-sm text-[var(--color-text-muted)]">
            Step 2 completes once you confirm your items.
          </p>
        </div>
      </div>
    </main>
  )
}
