'use client'

import { useEffect, useRef, useState } from 'react'
import {
  Check,
  Mic,
  MicOff,
  Minus,
  Plus,
  Sparkles,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react'
import { INVENTORY_UNITS } from '../utils/forecastSessionStore'
import { parseVoiceInventory } from '../utils/voiceApi'

const ITEM_VISUALS = {
  aloo: { emoji: '🥔', hindi: 'आलू', label: 'Potato' },
  potato: { emoji: '🥔', hindi: 'आलू', label: 'Potato' },
  baingan: { emoji: '🍆', hindi: 'बैंगन', label: 'Eggplant' },
  eggplant: { emoji: '🍆', hindi: 'बैंगन', label: 'Eggplant' },
  tamatar: { emoji: '🍅', hindi: 'टमाटर', label: 'Tomato' },
  tomato: { emoji: '🍅', hindi: 'टमाटर', label: 'Tomato' },
  pyaz: { emoji: '🧅', hindi: 'प्याज', label: 'Onion' },
  onion: { emoji: '🧅', hindi: 'प्याज', label: 'Onion' },
  matar: { emoji: '🟢', hindi: 'मटर', label: 'Peas' },
  gobhi: { emoji: '🥦', hindi: 'गोभी', label: 'Cauliflower' },
  bread: { emoji: '🍞', hindi: 'ब्रेड', label: 'Bread' },
  pav: { emoji: '🍞', hindi: 'पाव', label: 'Pav Bun' },
  milk: { emoji: '🥛', hindi: 'दूध', label: 'Milk' },
  doodh: { emoji: '🥛', hindi: 'दूध', label: 'Milk' },
  paneer: { emoji: '🧀', hindi: 'पनीर', label: 'Paneer' },
  samosa: { emoji: '🥟', hindi: 'समोसा', label: 'Samosa' },
  kachori: { emoji: '🥠', hindi: 'कचौड़ी', label: 'Kachori' },
  jalebi: { emoji: '🥨', hindi: 'जलेबी', label: 'Jalebi' },
  chhole: { emoji: '🫘', hindi: 'छोले', label: 'Chhole' },
  oil: { emoji: '🛢️', hindi: 'तेल', label: 'Oil' },
  sugar: { emoji: '🍬', hindi: 'चीनी', label: 'Sugar' },
  cheeni: { emoji: '🍬', hindi: 'चीनी', label: 'Sugar' },
  tea: { emoji: '🫖', hindi: 'चाय पत्ती', label: 'Tea' },
  'tea leaves': { emoji: '🫖', hindi: 'चाय पत्ती', label: 'Tea' },
  butter: { emoji: '🧈', hindi: 'मक्खन', label: 'Butter' },
  banana: { emoji: '🍌', hindi: 'केला', label: 'Banana' },
  kela: { emoji: '🍌', hindi: 'केला', label: 'Banana' },
  lemon: { emoji: '🍋', hindi: 'नींबू', label: 'Lemon' },
  mirch: { emoji: '🌶️', hindi: 'मिर्च', label: 'Chilli' },
  'green chillies': { emoji: '🌶️', hindi: 'हरी मिर्च', label: 'Green Chilli' },
  cups: { emoji: '☕', hindi: 'कप', label: 'Cups' },
}

const QUICK_CHIPS = [
  { label: '🥔 5 किलो आलू', text: '5 किलो आलू' },
  { label: '🍆 10 किलो बैंगन', text: '10 किलो बैंगन' },
  { label: '🍞 2 पैकेट ब्रेड', text: '2 पैकेट ब्रेड' },
  { label: '🥛 3 थैली दूध', text: '3 थैली दूध' },
  { label: '🥟 10 समोसा', text: '10 समोसा' },
]

function localClientParseHindi(text) {
  const norm = String(text || '').replace(/[०-९]/g, (d) => '०१२३४५६७८९'.indexOf(d))
  const numWords = {
    आधा: 0.5,
    aadha: 0.5,
    पाव: 0.25,
    सवा: 1.25,
    डेढ़: 1.5,
    dedh: 1.5,
    ढाई: 2.5,
    dhai: 2.5,
    एक: 1,
    ek: 1,
    दो: 2,
    do: 2,
    तीन: 3,
    teen: 3,
    चार: 4,
    char: 4,
    पाँच: 5,
    पांच: 5,
    paanch: 5,
    दस: 10,
    das: 10,
    बीस: 20,
    bees: 20,
  }
  const aliases = {
    आलू: 'aloo',
    aloo: 'aloo',
    बैंगन: 'baingan',
    बैगन: 'baingan',
    baingan: 'baingan',
    टमाटर: 'tamatar',
    tamatar: 'tamatar',
    प्याज: 'pyaz',
    प्याज़: 'pyaz',
    pyaz: 'pyaz',
    दूध: 'milk',
    milk: 'milk',
    ब्रेड: 'bread',
    bread: 'bread',
    पाव: 'pav',
    pav: 'pav',
    पनीर: 'paneer',
    paneer: 'paneer',
    समोसा: 'samosa',
    samosa: 'samosa',
    मटर: 'matar',
    गोभी: 'gobhi',
    मिर्च: 'mirch',
    तेल: 'oil',
    चीनी: 'sugar',
  }
  const unitMap = {
    किलो: 'kg',
    kg: 'kg',
    पैकेट: 'packets',
    packet: 'packets',
    packets: 'packets',
    थैली: 'packets',
    लीटर: 'litres',
    litre: 'litres',
    litres: 'litres',
    ठो: 'pieces',
    गो: 'pieces',
    नग: 'pieces',
    पीस: 'pieces',
    दर्जन: 'dozen',
  }
  const stopWords = new Set([
    'है',
    'हैं',
    'अरे',
    'भैया',
    'लिखो',
    'सुनो',
    'बाबू',
    'आज',
    'बचा',
    'पड़ा',
    'और',
    'का',
    'की',
    'के',
    'में',
    'पास',
    'मेरे',
  ])

  const tokens = norm.split(/\s+/).filter(Boolean)
  const items = []
  let qty = null
  let unit = 'kg'
  let itemTokens = []

  const commit = () => {
    const rawName = itemTokens.join(' ').trim()
    if (rawName && qty != null) {
      const mappedItem = aliases[rawName] || rawName
      items.push({ item: mappedItem, quantity: qty, unit })
    }
    qty = null
    unit = 'kg'
    itemTokens = []
  }

  for (const t of tokens) {
    const clean = t.toLowerCase().replace(/[।.,!?]/g, '')
    if (!clean || stopWords.has(clean)) continue
    const isNum = /^\d+(?:\.\d+)?$/.test(clean)
    const num = isNum ? Number.parseFloat(clean) : numWords[clean]
    if (num != null) {
      if (qty !== null && itemTokens.length > 0) commit()
      qty = num
      continue
    }
    if (unitMap[clean]) {
      unit = unitMap[clean]
      continue
    }
    itemTokens.push(clean)
  }
  commit()
  return items
}

export default function VoiceInventoryInput({ knownItems = [], onConfirm }) {
  const recognitionRef = useRef(null)
  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])
  const streamRef = useRef(null)

  const [listening, setListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [parsing, setParsing] = useState(false)
  const [parsedItems, setParsedItems] = useState([])
  const [error, setError] = useState('')
  const [soundEnabled, setSoundEnabled] = useState(true)

  const SpeechRecognition =
    typeof window !== 'undefined'
      ? window.SpeechRecognition || window.webkitSpeechRecognition
      : null

  useEffect(() => {
    return () => {
      stopAllMedia()
    }
  }, [])

  const stopAllMedia = () => {
    try {
      recognitionRef.current?.stop()
    } catch {}
    try {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop()
      }
    } catch {}
    try {
      streamRef.current?.getTracks()?.forEach((track) => track.stop())
    } catch {}
  }

  const speakHindi = (text) => {
    if (!soundEnabled || typeof window === 'undefined' || !window.speechSynthesis) return
    try {
      window.speechSynthesis.cancel()
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.lang = 'hi-IN'
      utterance.rate = 0.95
      window.speechSynthesis.speak(utterance)
    } catch {
      // Ignore speech synthesis failures
    }
  }

  const runParse = async (input, fallbackText = '') => {
    const isBlob = typeof Blob !== 'undefined' && input instanceof Blob
    const textVal = isBlob ? fallbackText : String(input || '').trim()

    if (!isBlob && !textVal) return

    setParsing(true)
    setError('')

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 5000)

    try {
      const result = await parseVoiceInventory(input, knownItems, { signal: controller.signal })
      clearTimeout(timeoutId)
      const items = Array.isArray(result?.items) ? result.items : []

      if (result?.transcript && isBlob) {
        setTranscript(result.transcript)
      }

      if (!items.length) {
        if (textVal) {
          const localItems = localClientParseHindi(textVal)
          if (localItems.length) {
            setParsedItems(localItems)
            const summary = localItems
              .map((i) => {
                const visual = ITEM_VISUALS[i.item.toLowerCase()]
                const hindiName = visual?.hindi || i.item
                return `${i.quantity} ${i.unit} ${hindiName}`
              })
              .join(' और ')
            speakHindi(`${summary} दर्ज हो गया।`)
            return
          }
        }
        setError(
          'सामान और मात्रा समझ नहीं आई। कृपया दोबारा बोलें (जैसे "5 किलो आलू, 2 पैकेट ब्रेड")',
        )
        setParsedItems([])
      } else {
        setParsedItems(items)
        const summary = items
          .map((i) => {
            const visual = ITEM_VISUALS[i.item.toLowerCase()]
            const hindiName = visual?.hindi || i.item
            return `${i.quantity} ${i.unit} ${hindiName}`
          })
          .join(' और ')
        speakHindi(`${summary} दर्ज हो गया। कृपया नीचे जांच कर पुष्टि करें।`)
      }
    } catch (err) {
      clearTimeout(timeoutId)
      console.warn('[voiceInput] parse error:', err?.code, err?.message)

      if (textVal) {
        const localItems = localClientParseHindi(textVal)
        if (localItems.length) {
          setParsedItems(localItems)
          const summary = localItems
            .map((i) => {
              const visual = ITEM_VISUALS[i.item.toLowerCase()]
              const hindiName = visual?.hindi || i.item
              return `${i.quantity} ${i.unit} ${hindiName}`
            })
            .join(' और ')
          speakHindi(`${summary} दर्ज हो गया।`)
          return
        }
      }

      if (err?.code === 'AUTH_REQUIRED') {
        try {
          const { startDemoAuth } = await import('../utils/auth')
          await startDemoAuth()
          const retry = await parseVoiceInventory(input, knownItems)
          const items = Array.isArray(retry?.items) ? retry.items : []
          if (items.length) {
            setParsedItems(items)
            return
          }
        } catch {}
        setError('कृपया पहले लॉगिन करें या डेमो में जारी रखें।')
      } else {
        setError(
          'आवाज़ समझ नहीं आई। कृपया दोबारा बोलें (जैसे: "5 किलो आलू, 10 किलो बैंगन")',
        )
      }
    } finally {
      setParsing(false)
    }
  }

  const startListening = async () => {
    setError('')
    setParsedItems([])
    audioChunksRef.current = []

    let stream = null
    let recorder = null

    try {
      if (navigator?.mediaDevices?.getUserMedia) {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        streamRef.current = stream

        const mimeTypes = ['audio/webm', 'audio/mp4', 'audio/ogg', 'audio/wav']
        const supportedMime =
          mimeTypes.find((type) => MediaRecorder?.isTypeSupported?.(type)) || ''

        recorder = supportedMime
          ? new MediaRecorder(stream, { mimeType: supportedMime })
          : new MediaRecorder(stream)

        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) {
            audioChunksRef.current.push(e.data)
          }
        }

        mediaRecorderRef.current = recorder
        recorder.start(250)
      }
    } catch (micErr) {
      console.warn('[voiceInput] MediaRecorder start error:', micErr)
    }

    let latestInterim = ''

    if (SpeechRecognition) {
      try {
        const recognition = new SpeechRecognition()
        recognition.lang = 'hi-IN'
        recognition.interimResults = true
        recognition.continuous = false
        recognitionRef.current = recognition

        recognition.onresult = (event) => {
          let combined = ''
          for (let i = 0; i < event.results.length; i += 1) {
            combined += event.results[i][0]?.transcript ?? ''
          }
          latestInterim = combined.trim()
          setTranscript(latestInterim)
        }

        recognition.onerror = (event) => {
          if (event?.error === 'not-allowed') {
            setError('माइक की अनुमति नहीं मिली। कृपया ब्राउज़र में माइक चालू करें।')
            stopListening()
          }
        }

        recognition.onend = () => {
          if (listening) {
            stopListening(latestInterim)
          }
        }

        recognition.start()
      } catch (recErr) {
        console.warn('[voiceInput] SpeechRecognition error:', recErr)
      }
    }

    setListening(true)
  }

  const stopListening = (optionalText = '') => {
    setListening(false)

    try {
      recognitionRef.current?.stop()
    } catch {}

    const recorder = mediaRecorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      recorder.onstop = () => {
        try {
          streamRef.current?.getTracks()?.forEach((track) => track.stop())
        } catch {}

        const mimeType = recorder.mimeType || 'audio/webm'
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType })
        const textToUse = optionalText || transcript

        if (audioBlob.size > 1000) {
          runParse(audioBlob, textToUse)
        } else if (textToUse.trim()) {
          runParse(textToUse)
        }
      }
      try {
        recorder.stop()
      } catch {}
    } else {
      try {
        streamRef.current?.getTracks()?.forEach((track) => track.stop())
      } catch {}
      const textToUse = (optionalText || transcript).trim()
      if (textToUse) {
        runParse(textToUse)
      }
    }
  }

  const handleToggleListening = () => {
    if (listening) {
      stopListening()
    } else {
      startListening()
    }
  }

  const adjustQuantity = (index, delta) => {
    setParsedItems((prev) =>
      prev.map((entry, idx) => {
        if (idx !== index) return entry
        const current = Number(entry.quantity) || 0
        const step = entry.unit === 'dozen' || entry.unit === 'pieces' || entry.unit === 'packets' ? 1 : 0.5
        const next = Math.max(0, Math.round((current + delta * step) * 10) / 10)
        return { ...entry, quantity: next }
      }),
    )
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
    speakHindi('स्टॉक सफलतापूर्वक अपडेट कर दिया गया है।')
  }

  return (
    <div className="mt-4 rounded-3xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-5 shadow-lg">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-3 w-3 rounded-full bg-emerald-500 animate-pulse" />
            <h3 className="text-base font-bold text-[var(--color-text-primary)]">
              बोल कर स्टॉक भरें (Voice Stock Input)
            </h3>
          </div>
          <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
            सीधे ठेले की भाषा में बोलें — AI अपने आप समझ जाएगा (उदा. &ldquo;5 किलो आलू, 10 किलो बैंगन, 2 पैकेट ब्रेड&rdquo;)
          </p>
        </div>

        <button
          type="button"
          onClick={() => setSoundEnabled((prev) => !prev)}
          title={soundEnabled ? 'आवाज़ बंद करें (Mute)' : 'आवाज़ चालू करें (Audio feedback on)'}
          className="rounded-full border border-[var(--color-border)] bg-[var(--color-bg-input)] p-2 text-[var(--color-text-secondary)] hover:text-[var(--color-primary)] transition"
        >
          {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
        </button>
      </div>

      {/* Main Microphone Button */}
      <div className="mt-5 flex flex-col items-center justify-center rounded-2xl border border-[rgba(251,191,36,0.2)] bg-gradient-to-b from-[rgba(251,191,36,0.06)] to-transparent p-6 text-center">
        <button
          type="button"
          onClick={handleToggleListening}
          disabled={parsing}
          className={`relative flex h-24 w-24 items-center justify-center rounded-full shadow-2xl transition-all duration-300 ${
            listening
              ? 'bg-rose-500 text-white shadow-[0_0_40px_rgba(244,63,94,0.6)] scale-110 animate-pulse'
              : 'bg-[var(--color-primary)] text-[#0D0D0D] hover:scale-105 shadow-[0_0_30px_var(--color-primary-glow)]'
          } disabled:opacity-50`}
          aria-label={listening ? 'बोलना बंद करें' : 'बोलने के लिए दबाएं'}
        >
          {listening ? (
            <MicOff className="h-10 w-10 animate-bounce" />
          ) : (
            <Mic className="h-10 w-10" />
          )}

          {listening ? (
            <span className="absolute -bottom-1 -right-1 flex h-6 w-6">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-6 w-6 bg-rose-600" />
            </span>
          ) : null}
        </button>

        <p className="mt-4 text-sm font-bold text-[var(--color-text-primary)]">
          {listening
            ? '🔴 सुन रहे हैं... बोलिए (Tap to finish)'
            : parsing
              ? '✨ AI समझ रहा है... (Analyzing speech...)'
              : '👆 माइक दबाएं और बोलें (Tap mic to speak)'}
        </p>

        {transcript ? (
          <div className="mt-3 max-w-lg rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-input)] px-4 py-2 text-sm font-medium text-[var(--color-text-primary)]">
            &ldquo;{transcript}&rdquo;
          </div>
        ) : null}

        {/* Quick Suggestion Chips */}
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {QUICK_CHIPS.map((chip) => (
            <button
              key={chip.text}
              type="button"
              disabled={parsing || listening}
              onClick={() => {
                setTranscript(chip.text)
                runParse(chip.text)
              }}
              className="rounded-full border border-[var(--color-border)] bg-[var(--color-bg-input)] px-3 py-1.5 text-xs font-semibold text-[var(--color-text-secondary)] transition hover:border-[var(--color-primary)] hover:text-[var(--color-text-primary)] disabled:opacity-50"
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>

      {/* Manual Input Fallback */}
      <div className="mt-3 flex items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-input)] px-3 py-2">
        <input
          value={transcript}
          onChange={(event) => setTranscript(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              runParse(transcript)
            }
          }}
          placeholder='या यहाँ लिखें (उदा. "5 किलो आलू, 10 किलो बैंगन")'
          aria-label="Hindi inventory text"
          className="flex-1 bg-transparent text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] outline-none"
        />
        <button
          type="button"
          onClick={() => runParse(transcript)}
          disabled={parsing || !transcript.trim()}
          className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-bg-card)] px-3 py-1.5 text-xs font-semibold text-[var(--color-text-primary)] transition hover:border-[var(--color-primary)] disabled:opacity-50"
        >
          <Sparkles className="h-3.5 w-3.5 text-[var(--color-primary)]" />
          {parsing ? 'समझ रहे हैं...' : 'समझें'}
        </button>
      </div>

      {error ? (
        <div className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs font-semibold text-rose-300">
          ⚠️ {error}
        </div>
      ) : null}

      {/* Recognized Items Confirmation Cards */}
      {parsedItems.length > 0 ? (
        <div className="mt-5 rounded-2xl border border-emerald-500/40 bg-emerald-500/5 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                ✅ AI ने ये सामान पहचाना (Review &amp; Confirm)
              </p>
              <p className="text-xs text-[var(--color-text-muted)]">
                मात्रा कम या ज्यादा करने के लिए + और - दबाएं
              </p>
            </div>
            {soundEnabled ? (
              <button
                type="button"
                onClick={() => {
                  const summary = parsedItems
                    .map((i) => {
                      const visual = ITEM_VISUALS[i.item.toLowerCase()]
                      const hindiName = visual?.hindi || i.item
                      return `${i.quantity} ${i.unit} ${hindiName}`
                    })
                    .join(' और ')
                  speakHindi(`${summary} दर्ज हैं।`)
                }}
                className="inline-flex items-center gap-1 text-xs text-emerald-400 hover:underline"
              >
                <Volume2 className="h-3.5 w-3.5" />
                सुनाएं
              </button>
            ) : null}
          </div>

          <div className="mt-3 space-y-3">
            {parsedItems.map((entry, idx) => {
              const visual = ITEM_VISUALS[entry.item.toLowerCase()] || {
                emoji: '📦',
                hindi: entry.item,
                label: entry.item,
              }

              return (
                <div
                  key={`${entry.item}-${idx}`}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-3 shadow-sm"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--color-bg-input)] text-2xl shadow-inner">
                      {visual.emoji}
                    </span>
                    <div>
                      <p className="text-sm font-bold text-[var(--color-text-primary)]">
                        {visual.hindi}
                        {visual.label && visual.label !== visual.hindi ? (
                          <span className="ml-1.5 text-xs font-normal text-[var(--color-text-secondary)]">
                            ({visual.label})
                          </span>
                        ) : null}
                      </p>
                      <p className="text-[11px] text-[var(--color-text-muted)]">
                        पहचाना गया नाम: {entry.item}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Big Touch Minus Button */}
                    <button
                      type="button"
                      onClick={() => adjustQuantity(idx, -1)}
                      aria-label="Decrease quantity"
                      className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-input)] text-base font-bold text-[var(--color-text-primary)] hover:bg-[var(--color-primary)] hover:text-black transition"
                    >
                      <Minus className="h-4 w-4" />
                    </button>

                    {/* Quantity Display */}
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={entry.quantity}
                      onChange={(event) => handleParsedChange(idx, 'quantity', event.target.value)}
                      aria-label={`Parsed quantity for ${entry.item}`}
                      className="w-16 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-input)] py-1.5 text-center text-sm font-bold text-[var(--color-text-primary)] outline-none focus:border-[var(--color-primary)]"
                    />

                    {/* Big Touch Plus Button */}
                    <button
                      type="button"
                      onClick={() => adjustQuantity(idx, 1)}
                      aria-label="Increase quantity"
                      className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-input)] text-base font-bold text-[var(--color-text-primary)] hover:bg-[var(--color-primary)] hover:text-black transition"
                    >
                      <Plus className="h-4 w-4" />
                    </button>

                    {/* Unit Selector */}
                    <select
                      value={entry.unit}
                      onChange={(event) => handleParsedChange(idx, 'unit', event.target.value)}
                      aria-label={`Parsed unit for ${entry.item}`}
                      className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-input)] px-2 py-1.5 text-xs font-semibold text-[var(--color-text-primary)] outline-none"
                    >
                      {INVENTORY_UNITS.map((unit) => (
                        <option key={unit} value={unit}>
                          {unit}
                        </option>
                      ))}
                    </select>

                    {/* Delete Item */}
                    <button
                      type="button"
                      onClick={() => handleRemoveParsed(idx)}
                      aria-label={`Remove ${entry.item}`}
                      className="ml-1 rounded-full p-2 text-[var(--color-text-muted)] hover:bg-rose-500/10 hover:text-rose-400 transition"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleConfirm}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-6 py-3.5 text-sm font-bold text-black shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-400"
            >
              <Check className="h-5 w-5" />
              हाँ, सब सही है — स्टॉक सेव करें (Confirm &amp; Save)
            </button>
            <button
              type="button"
              onClick={() => setParsedItems([])}
              className="rounded-2xl border border-[var(--color-border)] px-4 py-3.5 text-xs font-bold text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-card)] transition"
            >
              रद्द करें (Cancel)
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
