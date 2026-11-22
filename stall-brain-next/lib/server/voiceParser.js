import { config } from './config.js'
import { getLlm } from './llm.js'
import {
  normalizeVoiceInventory,
  VoiceInventoryParseSchema,
} from './schemas.js'

const SYSTEM_PROMPT = `You are an expert AI assistant that understands Indian street vendors and small stall owners (ठेले वाले / पटरी दुकानदार).
Vendors may be minimally educated and speak in informal, conversational, or dialect-heavy Hindi, Awadhi, Bhojpuri, or Hinglish.
They often include filler phrases like:
- "अरे भैया लिखो..." ("Bhaiya likho...")
- "अरे सुनो..." ("Are suno...")
- "आज दुकान में इतना माल बचा है..." ("Aaj dukan mein itna maal bacha hai...")
- "इतना सामान है..." ("Itna saaman hai...")
- "लिख लो भाई..." ("Likh lo bhai...")

Your task is to automatically understand what inventory items and quantities they are describing, ignoring all conversational noise.

Respond ONLY matching the JSON schema:
{
  "items": [
    { "item": "aloo", "quantity": 10, "unit": "kg" }
  ]
}

Strict Rules:
1. Allowed units ONLY: "kg", "g", "litres", "pieces", "packets", "dozen".
2. Convert colloquial and dialect terms:
   - Fractional numbers:
     - "आधा" / "aadha" = 0.5
     - "सवा" / "sawa" = 1.25
     - "डेढ़" / "dedh" = 1.5
     - "पौने दो" = 1.75
     - "ढाई" / "dhai" = 2.5
     - "पौने तीन" = 2.75
     - "साढ़े तीन" = 3.5
     - "साढ़े चार" = 4.5
   - Count words & dialect classifiers:
     - "ठो" (e.g. "दस ठो समोसा", "चार ठो पाव") -> unit: "pieces"
     - "गो" (e.g. "पाँच गो अंडा") -> unit: "pieces"
     - "नग" (e.g. "बारह नग केला") -> unit: "pieces"
     - "थैली" (e.g. "तीन थैली दूध", "दो थैली तेल") -> unit: "packets" or "litres"
     - "कट्टा" / "बोरी" (e.g. "एक कट्टा प्याज") -> unit: "packets"
     - "डिब्बा" (e.g. "दो डिब्बा बिस्कुट") -> unit: "packets"
     - "गड्डी" / "गुच्छा" (e.g. "दो गड्डी धनिया") -> unit: "pieces"
3. Clean standard item names:
   - Output standard item names (e.g. "aloo", "baingan", "tamatar", "pyaz", "milk", "bread", "paneer", "samosa", "oil", "chai patti", "sugar", "butter").
   - If the vendor's KNOWN ITEMS match, prefer the exact matching known item name.
4. If no clear items or quantities are found in the speech, return {"items": []}.`

export async function transcribeAudioBuffer({ buffer, mimeType = 'audio/webm' }) {
  const apiKey = config.groqApiKey
  if (!apiKey) {
    throw new Error('GROQ_API_KEY is not configured for Whisper audio transcription.')
  }

  const extension = mimeType.includes('wav')
    ? 'wav'
    : mimeType.includes('mp4') || mimeType.includes('m4a')
      ? 'm4a'
      : mimeType.includes('ogg')
        ? 'ogg'
        : 'webm'

  const formData = new FormData()
  const blob = new Blob([buffer], { type: mimeType })
  formData.append('file', blob, `audio.${extension}`)
  formData.append('model', 'whisper-large-v3-turbo')
  formData.append('language', 'hi')
  formData.append(
    'prompt',
    'आलू, प्याज, टमाटर, बैंगन, गोभी, मटर, दूध, पनीर, ब्रेड, पाव, समोसा, चाट, ठेला, किलो, पैकेट, दर्जन, लीटर, थैली, ग्राम',
  )

  const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  })

  if (!res.ok) {
    const errorText = await res.text().catch(() => '')
    console.error('[whisper] Groq transcription error:', res.status, errorText)
    throw new Error(`Groq Whisper transcription failed: ${res.statusText}`)
  }

  const json = await res.json()
  return (json.text || '').trim()
}

const NUMBER_WORDS = {
  paav: 0.25,
  पाव: 0.25,
  aadha: 0.5,
  adha: 0.5,
  आधा: 0.5,
  paune: 0.75,
  पौने: 0.75,
  ek: 1,
  एक: 1,
  sawa: 1.25,
  सवा: 1.25,
  dedh: 1.5,
  डेढ़: 1.5,
  do: 2,
  दो: 2,
  dhai: 2.5,
  ढाई: 2.5,
  teen: 3,
  तीन: 3,
  char: 4,
  chaar: 4,
  चार: 4,
  paanch: 5,
  panch: 5,
  पांच: 5,
  पाँच: 5,
  chhah: 6,
  chhe: 6,
  छह: 6,
  saat: 7,
  सात: 7,
  aath: 8,
  आठ: 8,
  nau: 9,
  नौ: 9,
  das: 10,
  दस: 10,
  gyarah: 11,
  barah: 12,
  pandrah: 15,
  bees: 20,
  बीस: 20,
  pachees: 25,
  tees: 30,
  chalis: 40,
  pachas: 50,
  पचास: 50,
  sau: 100,
  सौ: 100,
}

function normalizeDevanagariDigits(str) {
  return String(str || '').replace(/[०-९]/g, (d) => '०१२३४५६७८९'.indexOf(d))
}

export function fallbackParseVoiceTranscript(transcript, knownItems = []) {
  const normalizedText = normalizeDevanagariDigits(transcript)
  const segments = String(normalizedText ?? '')
    .split(/[,]|(?:\s+(?:aur|and|और)\s+)/i)
    .map((s) => s.trim())
    .filter(Boolean)

  const unitPattern =
    '(kg|kilo|kilos|kilogram|kilograms|किलो|किग्रा|कि\\.ग्रा|g|gm|gms|gram|grams|ग्राम|litre|litres|liter|liters|l|लीटर|piece|pieces|pcs|pc|nag|नग|नाग|ठो|गो|गड्डी|गुच्छा|packet|packets|pkt|pkts|पैकेट|थैली|बोरी|कट्टा|डिब्बा|dozen|dozens|darjan|दर्जन)'
  const stopWords = new Set([
    'are',
    'अरे',
    'bhaiya',
    'भैया',
    'bhai',
    'भाई',
    'suno',
    'सुनो',
    'likho',
    'लिखो',
    'likh',
    'लिख',
    'lo',
    'लो',
    'babu',
    'बाबू',
    'aaj',
    'आज',
    'dukan',
    'दुकान',
    'dhar',
    'धर',
    'rakh',
    'रख',
    'maal',
    'माल',
    'saaman',
    'सामान',
    'itna',
    'इतना',
    'thoda',
    'थोड़ा',
    'bhi',
    'भी',
    'baki',
    'बाकी',
    'bacha',
    'बचा',
    'bache',
    'बचे',
    'padi',
    'पड़ी',
    'pada',
    'पड़ा',
    'pade',
    'पड़े',
    'hai',
    'है',
    'hain',
    'हैं',
    'mere',
    'मेरे',
    'paas',
    'पास',
    'pass',
    'stock',
    'स्टॉक',
    'mein',
    'में',
    'me',
    'ka',
    'का',
    'ki',
    'की',
    'ke',
    'के',
  ])

  const rawItems = []
  for (const seg of segments) {
    const tokens = seg.split(/\s+/).filter(Boolean)
    let quantity = null
    let unit = 'kg'
    let itemTokens = []

    const commitItem = () => {
      const itemName = itemTokens.join(' ').trim()
      if (itemName && quantity != null) {
        rawItems.push({ item: itemName, quantity, unit })
      }
      quantity = null
      unit = 'kg'
      itemTokens = []
    }

    for (const token of tokens) {
      const clean = token.toLowerCase().replace(/[।.,!?]/g, '')
      if (!clean || stopWords.has(clean)) continue

      const isDigit = /^\d+(?:\.\d+)?$/.test(clean)
      const numVal = isDigit ? Number.parseFloat(clean) : NUMBER_WORDS[clean]

      if (numVal != null) {
        // If we already have a quantity and accumulated item tokens, the next number starts a new item.
        if (quantity !== null && itemTokens.length > 0) {
          commitItem()
        }
        quantity = numVal
        continue
      }

      if (new RegExp(`^${unitPattern}$`, 'i').test(clean)) {
        unit = clean
        continue
      }

      itemTokens.push(token.replace(/[।.,!?]/g, ''))
    }

    commitItem()
  }

  return VoiceInventoryParseSchema.parse(
    normalizeVoiceInventory({ items: rawItems }, knownItems),
  )
}

export async function parseVoiceTranscript({
  transcript,
  knownItems = [],
  llm = null,
  skipLlm = false,
}) {
  if (!skipLlm) {
    try {
      const model = llm ?? getLlm()
      const structuredLlm = model.withStructuredOutput(VoiceInventoryParseSchema)
      const knownLine = knownItems.length
        ? `KNOWN ITEMS FOR THIS STALL: ${knownItems.join(', ')}`
        : 'KNOWN ITEMS: none yet'

      const raw = await structuredLlm.invoke([
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: `${knownLine}\nSPOKEN TRANSCRIPT: "${transcript}"\nExtract inventory items.`,
        },
      ])

      const parsed = VoiceInventoryParseSchema.parse(
        normalizeVoiceInventory(raw, knownItems),
      )
      return { items: parsed.items, method: 'llm' }
    } catch (error) {
      console.warn('[voice] LLM parse failed, using fallback parser:', error?.message)
    }
  }

  const fallback = fallbackParseVoiceTranscript(transcript, knownItems)
  return { items: fallback.items, method: 'fallback' }
}
