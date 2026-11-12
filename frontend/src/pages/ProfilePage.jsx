import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { GripVertical, Plus, X } from 'lucide-react'
import { signOut } from 'firebase/auth'
import Header from '../components/Header'
import StallSelector from '../components/StallSelector'
import { stalls } from '../data/stalls'
import {
  loadProfile,
  normalizeIngredients,
  normalizeItemPrices,
  saveProfile,
} from '../utils/profileStorage'
import { fetchServerProfile, pushServerProfile } from '../utils/profileApi'
import { apiRequest } from '../utils/api'
import { clearForecastSession } from '../utils/forecastSessionStore'
import { auth } from '../utils/firebase'

export default function ProfilePage() {
  const navigate = useNavigate()
  const location = useLocation()
  const storedProfile = useMemo(() => loadProfile(), [])

  const [selectedStallId, setSelectedStallId] = useState(
    storedProfile?.stallType ?? null,
  )
  const [items, setItems] = useState(() => storedProfile?.ingredients ?? [])
  const [dailyBudgetInr, setDailyBudgetInr] = useState(() =>
    storedProfile?.dailyBudgetInr != null ? String(storedProfile.dailyBudgetInr) : '',
  )
  const [itemPrices, setItemPrices] = useState(() => storedProfile?.itemPrices ?? {})
  const [whatsappOptIn, setWhatsappOptIn] = useState(
    () => Boolean(storedProfile?.whatsappOptIn),
  )
  const [whatsappPhone, setWhatsappPhone] = useState(
    () => storedProfile?.whatsappPhone ?? '',
  )
  const [lane, setLane] = useState(() => storedProfile?.lane ?? 'Hazratganj')
  const [groupBuyingOptIn, setGroupBuyingOptIn] = useState(
    () => Boolean(storedProfile?.groupBuyingOptIn),
  )
  const [waPreview, setWaPreview] = useState('')
  const [newItem, setNewItem] = useState('')
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')

  const selectedStall = stalls.find((stall) => stall.id === selectedStallId)
  const itemCountLabel = `${items.length} default items`
  const bannerMessage = location.state?.banner

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(''), 2800)
    return () => clearTimeout(timer)
  }, [toast])

  // The server is the source of truth (T2.2): if this browser has no cached
  // profile (cleared storage, new device), restore it from Firestore.
  useEffect(() => {
    if (storedProfile) return
    let active = true
    fetchServerProfile()
      .then((profile) => {
        if (!active || !profile) return
        const cached = saveProfile(profile)
        if (!cached) return
        setSelectedStallId(cached.stallType)
        setItems(cached.ingredients)
        setDailyBudgetInr(
          cached.dailyBudgetInr != null ? String(cached.dailyBudgetInr) : '',
        )
        setItemPrices(cached.itemPrices ?? {})
        setWhatsappOptIn(Boolean(cached.whatsappOptIn))
        setWhatsappPhone(cached.whatsappPhone ?? '')
        setLane(cached.lane ?? 'Hazratganj')
        setGroupBuyingOptIn(Boolean(cached.groupBuyingOptIn))
      })
      .catch(() => {
        // Offline or backend down: the vendor can still fill the form manually.
      })
    return () => {
      active = false
    }
  }, [storedProfile])

  const handleSelectStall = (stallId) => {
    const stall = stalls.find((entry) => entry.id === stallId)
    if (!stall) return
    setSelectedStallId(stallId)
    setItems([...stall.items])
    setError('')
  }

  const handleItemChange = (index, value) => {
    const oldName = items[index]
    setItems((prev) => {
      const next = [...prev]
      next[index] = value
      return next
    })
    if (oldName && oldName !== value && itemPrices[oldName]) {
      setItemPrices((prev) => {
        const next = { ...prev }
        const existing = next[oldName]
        delete next[oldName]
        if (value.trim()) next[value.trim()] = existing
        return next
      })
    }
    setError('')
  }

  const handlePriceChange = (itemName, field, value) => {
    const key = itemName.trim()
    if (!key) return
    setItemPrices((prev) => {
      const current = prev[key] ?? {}
      const trimmed = value.trim()
      if (trimmed === '') {
        const nextEntry = { ...current }
        delete nextEntry[field]
        if (Object.keys(nextEntry).length === 0) {
          const next = { ...prev }
          delete next[key]
          return next
        }
        return { ...prev, [key]: nextEntry }
      }
      const num = Number(trimmed)
      if (!Number.isFinite(num) || num < 0) return prev
      return {
        ...prev,
        [key]: { ...current, [field]: num },
      }
    })
  }

  const handleRemoveItem = (index) => {
    setItems((prev) => prev.filter((_, idx) => idx !== index))
    setError('')
  }

  const handleAddItem = () => {
    const trimmed = newItem.trim()
    if (!trimmed) return
    setItems((prev) => [...prev, trimmed])
    setNewItem('')
    setError('')
  }

  const handleResetDefaults = () => {
    if (!selectedStall) return
    setItems([...selectedStall.items])
    setError('')
  }

  const handleSaveProfile = () => {
    if (!selectedStall) {
      setError('Select a stall type before saving your profile.')
      return
    }

    const cleanedItems = normalizeIngredients(items)
    if (cleanedItems.length < 1) {
      setError('Add at least one ingredient before saving.')
      return
    }

    const parsedBudget =
      dailyBudgetInr.trim() === '' ? null : Number(dailyBudgetInr)
    if (
      parsedBudget !== null &&
      (!Number.isFinite(parsedBudget) || parsedBudget < 0)
    ) {
      setError('Daily budget must be 0 or higher.')
      return
    }

    const activePrices = Object.fromEntries(
      Object.entries(normalizeItemPrices(itemPrices)).filter(([name]) =>
        cleanedItems.includes(name),
      ),
    )

    const saved = saveProfile({
      stallType: selectedStall.id,
      stallLabel: selectedStall.name,
      stallEmoji: selectedStall.emoji,
      ingredients: cleanedItems,
      dailyBudgetInr: parsedBudget,
      itemPrices: activePrices,
      whatsappOptIn,
      whatsappPhone: whatsappPhone.trim(),
      lane: lane.trim() || 'Hazratganj',
      groupBuyingOptIn,
    })

    if (!saved) {
      setError('Unable to save your profile. Please try again.')
      return
    }

    // Sync to Firestore in the background (T2.2): the vendor never waits on
    // the network; local cache already has everything the app needs.
    pushServerProfile(saved).catch(() => {
      // Ignore: the profile still works from the cache and will sync on the
      // next save.
    })

    setItems(saved.ingredients)
    setError('')
    setToast('Profile saved! Your stall is ready.')
    navigate('/forecast')
  }

  const handlePreviewWhatsapp = async () => {
    try {
      const sampleItems = normalizeIngredients(items).slice(0, 4).map((name) => ({
        item: name,
        toBuy: '5 units',
      }))
      const resp = await apiRequest('/api/whatsapp/preview', {
        method: 'POST',
        body: {
          phone: whatsappPhone.trim() || undefined,
          stallLabel: selectedStall?.name ?? 'आपका ठेला',
          plan: { procurementList: sampleItems },
          send: false,
        },
      })
      if (resp?.message) setWaPreview(resp.message)
    } catch {
      setWaPreview('Preview requires backend connection.')
    }
  }

  const handleLogout = async () => {
    clearForecastSession()
    await signOut(auth)
    navigate('/login')
  }

  return (
    <main className="relative min-h-screen">
      {toast ? (
        <div className="fixed right-6 top-6 z-50 rounded-full border border-(--color-success) bg-[rgba(74,222,128,0.16)] px-4 py-2 text-sm font-semibold text-(--color-success)">
          {toast}
        </div>
      ) : null}
      <div className="relative z-10 mx-auto flex min-h-screen max-w-6xl flex-col px-4 pb-12 pt-8 sm:px-6 lg:px-10">
        <Header />

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <Link
            to="/forecast"
            className="inline-flex items-center rounded-full border border-(--color-border) bg-transparent px-4 py-2 text-sm font-semibold text-(--color-text-secondary) transition hover:bg-(--color-bg-card-hover)"
          >
            Back to Forecast
          </Link>
          <div className="flex items-center gap-3">
            <span className="text-xs uppercase tracking-[0.2em] text-(--color-text-muted)">
              Profile
            </span>
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center rounded-full border border-(--color-border) bg-transparent px-4 py-2 text-xs font-semibold text-(--color-text-secondary) transition hover:bg-(--color-bg-card-hover)"
            >
              Logout
            </button>
          </div>
        </div>

        {bannerMessage ? (
          <div className="mt-6 rounded-2xl border border-[rgba(251,191,36,0.5)] bg-[rgba(251,191,36,0.12)] px-5 py-4 text-sm text-(--color-text-primary)">
            {bannerMessage}
          </div>
        ) : null}

        <section className="mt-6 rounded-2xl border border-(--color-border) bg-(--color-bg-card) px-6 py-5">
          <h2 className="text-xl font-semibold text-(--color-text-primary)">
            Your Stall Profile
          </h2>
          <p className="mt-1 text-sm text-(--color-text-secondary)">
            This is your permanent stall setup. You can update it anytime.
          </p>
        </section>

        <StallSelector
          stalls={stalls}
          selectedId={selectedStallId}
          onSelect={handleSelectStall}
        />

        {selectedStall ? (
          <section className="mt-8">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-(--color-text-primary)">
                  Default ingredients
                </h3>
                <p className="mt-1 text-sm text-(--color-text-secondary)">
                  {itemCountLabel}
                </p>
              </div>
              <button
                type="button"
                onClick={handleResetDefaults}
                className="text-sm font-semibold text-(--color-primary) transition hover:text-(--color-primary-dark)"
              >
                Reset to defaults
              </button>
            </div>

            <div className="mt-4 rounded-2xl border border-(--color-border) bg-(--color-bg-card) p-4">
              <div className="max-h-72 space-y-3 overflow-y-auto pr-2">
                {items.length ? (
                  items.map((item, index) => (
                    <div
                      key={`${item}-${index}`}
                      className="flex flex-wrap items-center gap-3 rounded-xl border border-(--color-border) bg-(--color-bg-input) px-3 py-2 focus-within:border-(--color-border-focus)"
                    >
                      <GripVertical className="h-4 w-4 text-(--color-text-muted)" />
                      <input
                        value={item}
                        onChange={(event) =>
                          handleItemChange(index, event.target.value)
                        }
                        className="min-w-[140px] flex-1 bg-transparent text-sm text-(--color-text-primary) outline-none"
                      />
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={itemPrices[item.trim()]?.buyPrice ?? ''}
                          onChange={(event) =>
                            handlePriceChange(item, 'buyPrice', event.target.value)
                          }
                          placeholder="Buy ₹"
                          aria-label={`Buy price for ${item}`}
                          className="w-24 rounded-lg border border-(--color-border) bg-(--color-bg-card) px-2.5 py-1 text-xs text-(--color-text-primary) placeholder:text-(--color-text-muted) outline-none focus:border-(--color-border-focus)"
                        />
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={itemPrices[item.trim()]?.sellPrice ?? ''}
                          onChange={(event) =>
                            handlePriceChange(item, 'sellPrice', event.target.value)
                          }
                          placeholder="Sell ₹"
                          aria-label={`Sell price for ${item}`}
                          className="w-24 rounded-lg border border-(--color-border) bg-(--color-bg-card) px-2.5 py-1 text-xs text-(--color-text-primary) placeholder:text-(--color-text-muted) outline-none focus:border-(--color-border-focus)"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(index)}
                        className="rounded-full border border-transparent p-1 text-(--color-text-muted) transition hover:border-(--color-danger) hover:text-(--color-danger)"
                        aria-label="Remove item"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="rounded-xl border border-(--color-border) bg-(--color-bg-input) px-4 py-3 text-sm text-(--color-text-muted)">
                    No items yet. Add at least one item to continue.
                  </div>
                )}
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-(--color-border) bg-(--color-bg-input) px-3 py-2 focus-within:border-(--color-border-focus)">
                <input
                  value={newItem}
                  onChange={(event) => setNewItem(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      handleAddItem()
                    }
                  }}
                  placeholder="Add a new ingredient..."
                  className="flex-1 bg-transparent text-sm text-(--color-text-primary) placeholder:text-(--color-text-muted) outline-none"
                />
                <button
                  type="button"
                  onClick={handleAddItem}
                  className="inline-flex items-center gap-2 rounded-full bg-(--color-primary) px-3 py-1.5 text-xs font-semibold text-[#0D0D0D] transition hover:bg-(--color-primary-dark)"
                >
                  <Plus className="h-4 w-4" />
                  Add Item
                </button>
              </div>
            </div>

            <div className="mt-6 rounded-2xl border border-(--color-border) bg-(--color-bg-card) p-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <label
                    htmlFor="daily-budget-input"
                    className="text-sm font-semibold text-(--color-text-primary)"
                  >
                    Daily Budget Cap (₹) — optional
                  </label>
                  <p className="mt-1 text-xs text-(--color-text-secondary)">
                    When set, the agent maximizes expected profit while staying within this budget. Leave buy/sell ₹ blank to use Lucknow mandi defaults.
                  </p>
                </div>
                <input
                  id="daily-budget-input"
                  type="number"
                  min="0"
                  step="any"
                  value={dailyBudgetInr}
                  onChange={(event) => {
                    setDailyBudgetInr(event.target.value)
                    setError('')
                  }}
                  placeholder="No cap (e.g. 1500)"
                  className="w-48 rounded-xl border border-(--color-border) bg-(--color-bg-input) px-3 py-2 text-sm text-(--color-text-primary) placeholder:text-(--color-text-muted) outline-none focus:border-(--color-border-focus)"
                />
              </div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-(--color-border) bg-(--color-bg-card) p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-(--color-text-primary)">
                      WhatsApp 6 AM Morning Briefing
                    </p>
                    <p className="mt-1 text-xs text-(--color-text-secondary)">
                      Receive a compact Hindi buy list daily at 6:00 AM IST. Reply 1 to approve or STOP anytime.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={whatsappOptIn}
                    onChange={(event) => setWhatsappOptIn(event.target.checked)}
                    aria-label="Opt into 6 AM WhatsApp briefing"
                    className="mt-1 h-4 w-4 accent-(--color-primary)"
                  />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <input
                    type="tel"
                    value={whatsappPhone}
                    onChange={(event) => setWhatsappPhone(event.target.value)}
                    placeholder="+91 98XXXXXXXX"
                    aria-label="WhatsApp phone number"
                    className="min-w-[180px] flex-1 rounded-xl border border-(--color-border) bg-(--color-bg-input) px-3 py-2 text-sm text-(--color-text-primary) placeholder:text-(--color-text-muted) outline-none focus:border-(--color-border-focus)"
                  />
                  <button
                    type="button"
                    onClick={handlePreviewWhatsapp}
                    className="rounded-xl border border-(--color-border) bg-transparent px-3 py-2 text-xs font-semibold text-(--color-text-secondary) hover:bg-(--color-bg-card-hover)"
                  >
                    Preview Hindi msg
                  </button>
                </div>
                {waPreview ? (
                  <pre className="mt-3 whitespace-pre-wrap rounded-xl border border-(--color-border) bg-(--color-bg-input) p-3 text-xs text-(--color-text-secondary)">
                    {waPreview}
                  </pre>
                ) : null}
              </div>

              <div className="rounded-2xl border border-(--color-border) bg-(--color-bg-card) p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-(--color-text-primary)">
                      Market Lane &amp; Group Buying
                    </p>
                    <p className="mt-1 text-xs text-(--color-text-secondary)">
                      Select your Lucknow market lane and optionally pool anonymous bulk demand with neighbors.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={groupBuyingOptIn}
                    onChange={(event) => setGroupBuyingOptIn(event.target.checked)}
                    aria-label="Opt into lane group buying"
                    className="mt-1 h-4 w-4 accent-(--color-primary)"
                  />
                </div>
                <select
                  value={lane}
                  onChange={(event) => setLane(event.target.value)}
                  aria-label="Market lane"
                  className="mt-3 w-full rounded-xl border border-(--color-border) bg-(--color-bg-input) px-3 py-2 text-sm text-(--color-text-primary) outline-none focus:border-(--color-border-focus)"
                >
                  <option value="Hazratganj">Hazratganj</option>
                  <option value="Janpath Market">Janpath Market</option>
                  <option value="Aminabad">Aminabad</option>
                  <option value="Gomti Nagar">Gomti Nagar</option>
                  <option value="Chowk">Chowk</option>
                  <option value="Alambagh">Alambagh</option>
                </select>
              </div>
            </div>
          </section>
        ) : null}

        {error ? (
          <p className="mt-4 text-sm text-(--color-danger)">{error}</p>
        ) : null}

        <div className="mt-8 flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={handleSaveProfile}
            disabled={!selectedStallId}
            className="inline-flex items-center justify-center rounded-full bg-(--color-primary) px-6 py-3 text-base font-semibold text-[#0D0D0D] shadow-[0_0_25px_var(--color-primary-glow)] transition hover:bg-(--color-primary-dark) disabled:cursor-not-allowed disabled:opacity-60"
          >
            Save Profile
          </button>
          <p className="text-sm text-(--color-text-muted)">
            Your profile is saved on this device for quick access.
          </p>
        </div>
      </div>
    </main>
  )
}
