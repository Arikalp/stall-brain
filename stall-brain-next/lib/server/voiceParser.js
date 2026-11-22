import { getLlm } from './llm.js'
import {
  normalizeVoiceInventory,
  VoiceInventoryParseSchema,
} from './schemas.js'

const SYSTEM_PROMPT = `You extract street vendor inventory items from spoken Hindi, Hinglish, or English transcripts.
Respond ONLY as JSON matching:
{
  "items": [
    { "item": "aloo", "quantity": 10, "unit": "kg" }
  ]
}
Rules:
- Allowed units ONLY: "kg", "g", "litres", "pieces", "packets", "dozen".
- Convert Hindi number words ("ek"=1, "do"=2, "teen"=3, "char"=4, "paanch"=5, "das"=10, "bees"=20, "aadha"=0.5, "dedh"=1.5, "dhai"=2.5, etc.) into numbers.
- If the spoken item matches one of the vendor's KNOWN ITEMS (including Hindi equivalents like "आलू"->"aloo", "दूध"->"milk", "चीनी"->"sugar", "चाय पत्ती"->"tea leaves", "भुट्टा"->"corn cobs"), use the exact known item name.
- If no clear item+quantity is found, return {"items": []}.`

const NUMBER_WORDS = {
  aadha: 0.5,
  adha: 0.5,
  आधा: 0.5,
  ek: 1,
  एक: 1,
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
    '(kg|kilo|kilos|kilogram|kilograms|किलो|किग्रा|कि\\.ग्रा|g|gm|gms|gram|grams|ग्राम|litre|litres|liter|liters|l|लीटर|piece|pieces|pcs|pc|nag|पीस|नग|packet|packets|pkt|pkts|पैकेट|dozen|dozens|darjan|दर्जन)'
  const stopWords = new Set([
    'hai',
    'hain',
    'है',
    'हैं',
    'mere',
    'paas',
    'pass',
    'stock',
    'mein',
    'me',
    'ka',
    'ki',
    'ke',
    'baki',
    'bacha',
    'padi',
    'pada',
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
