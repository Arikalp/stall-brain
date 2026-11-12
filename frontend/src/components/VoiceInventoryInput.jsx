import { useEffect, useRef, useState } from 'react'
import { Check, Mic, MicOff, Sparkles, X } from 'lucide-react'
import { INVENTORY_UNITS } from '../utils/forecastSessionStore'
import { parseVoiceInventory } from '../utils/voiceApi'

/**
 * Hindi voice inventory input (T3.1):
 * Uses Web Speech API (`hi-IN`) to capture spoken inventory like
 * "das kilo aloo hai", parses it via `POST /api/voice/parse-inventory`
 * (structured-output LLM + fallback), and displays parsed items for
 * vendor confirmation before updating stock.
 */
export default function VoiceInventoryInput({ knownItems = [], onConfirm }) {
  const recognitionRef = useRef(null)
  const [listening, setListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [parsing, setParsing] = useState(false)
  const [parsedItems, setParsedItems] = useState([])
  const [error, setError] = useState('')

  const SpeechRecognition =
    typeof window !== 'undefined'
      ? window.SpeechRecognition || window.webkitSpeechRecognition
      : null
  const speechSupported = Boolean(SpeechRecognition)

  useEffect(() => {
    return () => {
      try {
        recognitionRef.current?.stop()
      } catch {
        // Ignore cleanup errors when recognition already stopped.
      }
    }
  }, [])

  const runParse = async (text) => {
    const trimmed = text.trim()
    if (!trimmed) return
    setParsing(true)
    setError('')
    try {
      const result = await parseVoiceInventory(trimmed, knownItems)
      const items = Array.isArray(result?.items) ? result.items : []
      if (!items.length) {
        setError(
          'Could not detect an item & quantity. Try e.g. "das kilo aloo hai" or "5 litre milk".',
        )
        setParsedItems([])
      } else {
        setParsedItems(items)
      }
    } catch {
      setError('Could not parse voice input right now. Check connection and try again.')
    } finally {
      setParsing(false)
    }
  }

  const handleToggleListening = () => {
    if (!SpeechRecognition) return

    if (listening) {
      recognitionRef.current?.stop()
      setListening(false)
      return
    }

    setError('')
    setParsedItems([])

    const recognition = new SpeechRecognition()
    recognition.lang = 'hi-IN'
    recognition.interimResults = true
    recognition.continuous = false
    recognitionRef.current = recognition

    let latestFinal = ''

    recognition.onresult = (event) => {
      let combined = ''
      for (let i = 0; i < event.results.length; i += 1) {
        combined += event.results[i][0]?.transcript ?? ''
        if (event.results[i].isFinal) {
          latestFinal = combined
        }
      }
      setTranscript(combined.trim())
    }

    recognition.onerror = (event) => {
      setListening(false)
      if (event?.error === 'not-allowed') {
        setError('Microphone permission denied. Allow mic access or type your Hindi phrase below.')
      } else if (event?.error !== 'aborted') {
        setError('Mic did not catch that cleanly. Try again or type below.')
      }
    }

    recognition.onend = () => {
      setListening(false)
      const finalText = latestFinal.trim()
      if (finalText) {
        setTranscript(finalText)
        runParse(finalText)
      }
    }

    try {
      setListening(true)
      recognition.start()
    } catch {
      setListening(false)
      setError('Could not start microphone.')
    }
  }

  const handleParsedChange = (index, field, value) => {
    setParsedItems((prev) =>
      prev.map((entry, idx) => {
        if (idx !== index) return entry
        if (field === 'quantity') {
          const num = Number(value)
          return { ...entry, quantity: Number.isFinite(num) && num >= 0 ? num : 0 }
        }
        return { ...entry, [field]: value }
      }),
    )
  }

  const handleRemoveParsed = (index) => {
    setParsedItems((prev) => prev.filter((_, idx) => idx !== index))
  }

  const handleConfirm = () => {
    const clean = parsedItems
      .map((entry) => ({
        item: String(entry.item ?? '').trim(),
        quantity: Number(entry.quantity),
        unit: INVENTORY_UNITS.includes(entry.unit) ? entry.unit : INVENTORY_UNITS[0],
      }))
      .filter((entry) => entry.item && Number.isFinite(entry.quantity) && entry.quantity >= 0)

    if (!clean.length) return
    onConfirm?.(clean)
    setParsedItems([])
    setTranscript('')
    setError('')
  }

  return (
    <div className="mt-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[var(--color-text-primary)]">
            Speak Stock in Hindi / Hinglish (आवाज़ से स्टॉक भरें)
          </p>
          <p className="mt-0.5 text-xs text-[var(--color-text-secondary)]">
            Say something like &ldquo;das kilo aloo hai&rdquo; or &ldquo;5 litre doodh aur 2 packet chips&rdquo;
          </p>
        </div>

        {speechSupported ? (
          <button
            type="button"
            onClick={handleToggleListening}
            disabled={parsing}
            className={`inline-flex min-h-[44px] items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition disabled:opacity-60 ${
              listening
                ? 'border border-[var(--color-danger)] bg-[rgba(248,113,113,0.18)] text-[var(--color-danger)]'
                : 'bg-[var(--color-primary)] text-[#0D0D0D] hover:bg-[var(--color-primary-dark)]'
            }`}
          >
            {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            {listening ? 'Stop listening' : 'Speak (hi-IN)'}
          </button>
        ) : (
          <span className="rounded-full border border-[var(--color-border)] bg-[var(--color-bg-input)] px-3 py-1 text-xs text-[var(--color-text-muted)]">
            Mic unavailable — type phrase below
          </span>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-input)] px-3 py-2">
        <input
          value={transcript}
          onChange={(event) => setTranscript(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              runParse(transcript)
            }
          }}
          placeholder='e.g. "das kilo aloo hai"'
          aria-label="Spoken Hindi inventory transcript"
          className="flex-1 bg-transparent text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] outline-none"
        />
        <button
          type="button"
          onClick={() => runParse(transcript)}
          disabled={parsing || !transcript.trim()}
          className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-bg-card)] px-3 py-1.5 text-xs font-semibold text-[var(--color-text-primary)] transition hover:border-[var(--color-primary)] disabled:opacity-50"
        >
          <Sparkles className="h-3.5 w-3.5 text-[var(--color-primary)]" />
          {parsing ? 'Parsing...' : 'Parse'}
        </button>
      </div>

      {error ? (
        <p className="mt-2 text-xs text-[var(--color-danger)]">{error}</p>
      ) : null}

      {parsedItems.length > 0 ? (
        <div className="mt-4 rounded-xl border border-[rgba(250,204,21,0.4)] bg-[rgba(250,204,21,0.08)] p-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)]">
            Confirm parsed stock (जांच कर पुष्टि करें)
          </p>
          <div className="mt-2 space-y-2">
            {parsedItems.map((entry, idx) => (
              <div
                key={`${entry.item}-${idx}`}
                className="grid items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] px-3 py-2 sm:grid-cols-[1fr_90px_110px_auto]"
              >
                <input
                  value={entry.item}
                  onChange={(event) => handleParsedChange(idx, 'item', event.target.value)}
                  aria-label="Parsed item name"
                  className="bg-transparent text-sm font-semibold text-[var(--color-text-primary)] outline-none"
                />
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={entry.quantity}
                  onChange={(event) => handleParsedChange(idx, 'quantity', event.target.value)}
                  aria-label={`Parsed quantity for ${entry.item}`}
                  className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-input)] px-2 py-1 text-sm text-[var(--color-text-primary)] outline-none"
                />
                <select
                  value={entry.unit}
                  onChange={(event) => handleParsedChange(idx, 'unit', event.target.value)}
                  aria-label={`Parsed unit for ${entry.item}`}
                  className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-input)] px-2 py-1 text-sm text-[var(--color-text-primary)] outline-none"
                >
                  {INVENTORY_UNITS.map((unit) => (
                    <option key={unit} value={unit}>
                      {unit}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => handleRemoveParsed(idx)}
                  aria-label={`Remove ${entry.item}`}
                  className="justify-self-end rounded-full p-1 text-[var(--color-text-muted)] hover:text-[var(--color-danger)]"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleConfirm}
              className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-primary)] px-4 py-1.5 text-xs font-semibold text-[#0D0D0D] transition hover:bg-[var(--color-primary-dark)]"
            >
              <Check className="h-3.5 w-3.5" />
              Confirm &amp; update stock
            </button>
            <button
              type="button"
              onClick={() => setParsedItems([])}
              className="rounded-full border border-[var(--color-border)] px-4 py-1.5 text-xs font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-card)]"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

