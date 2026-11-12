/**
 * T3.1 - Hindi voice inventory parser tests
 */

import { describe, expect, it } from 'vitest'
import {
  normalizeVoiceInventory,
  VoiceInventoryParseSchema,
  VoiceInventoryRequestSchema,
} from '../src/schemas.js'
import {
  fallbackParseVoiceTranscript,
  parseVoiceTranscript,
} from '../src/routes/voice.js'

describe('normalizeVoiceInventory', () => {
  it('maps Hindi aliases, unit synonyms, and matches known items', () => {
    const raw = {
      items: [
        { item: 'आलू', quantity: '10', unit: 'kilo' },
        { item: 'दूध', quantity: 5, unit: 'लीटर' },
        { item: 'chips', quantity: 3, unit: 'packet' },
      ],
    }
    const normalized = normalizeVoiceInventory(raw, ['aloo', 'milk', 'sugar'])
    const parsed = VoiceInventoryParseSchema.parse(normalized)

    expect(parsed.items).toEqual([
      { item: 'aloo', quantity: 10, unit: 'kg' },
      { item: 'milk', quantity: 5, unit: 'litres' },
      { item: 'chips', quantity: 3, unit: 'packets' },
    ])
  })
})

describe('fallbackParseVoiceTranscript', () => {
  it('parses "das kilo aloo hai"', () => {
    const parsed = fallbackParseVoiceTranscript('das kilo aloo hai', ['aloo', 'chhole'])
    expect(parsed.items).toEqual([{ item: 'aloo', quantity: 10, unit: 'kg' }])
  })

  it('parses multiple Hindi/Hinglish items separated by aur', () => {
    const parsed = fallbackParseVoiceTranscript(
      '5 litre doodh aur do packet chips hai',
      ['milk', 'chips'],
    )
    expect(parsed.items).toEqual([
      { item: 'milk', quantity: 5, unit: 'litres' },
      { item: 'chips', quantity: 2, unit: 'packets' },
    ])
  })

  it('parses Devanagari quantities and items', () => {
    const parsed = fallbackParseVoiceTranscript('तीन किलो आलू', ['aloo'])
    expect(parsed.items).toEqual([{ item: 'aloo', quantity: 3, unit: 'kg' }])
  })

  it('returns empty items when no quantity is present', () => {
    const parsed = fallbackParseVoiceTranscript('hello namaste')
    expect(parsed.items).toEqual([])
  })
})

describe('parseVoiceTranscript', () => {
  it('uses structured-output LLM when available and validates against Zod', async () => {
    const fakeLlm = {
      withStructuredOutput: () => ({
        invoke: async () => ({
          items: [{ item: 'आलू', quantity: 10, unit: 'kilo' }],
        }),
      }),
    }

    const result = await parseVoiceTranscript({
      transcript: 'das kilo aloo hai',
      knownItems: ['aloo', 'sev'],
      llm: fakeLlm,
    })

    expect(result.method).toBe('llm')
    expect(result.items).toEqual([{ item: 'aloo', quantity: 10, unit: 'kg' }])
  })

  it('falls back deterministically when the LLM call throws', async () => {
    const brokenLlm = {
      withStructuredOutput: () => ({
        invoke: async () => {
          throw new Error('Groq timeout')
        },
      }),
    }

    const result = await parseVoiceTranscript({
      transcript: 'das kilo aloo hai',
      knownItems: ['aloo'],
      llm: brokenLlm,
    })

    expect(result.method).toBe('fallback')
    expect(result.items).toEqual([{ item: 'aloo', quantity: 10, unit: 'kg' }])
  })
})

describe('VoiceInventoryRequestSchema', () => {
  it('rejects empty transcripts and accepts valid payloads', () => {
    expect(() => VoiceInventoryRequestSchema.parse({ transcript: '   ' })).toThrow()
    const ok = VoiceInventoryRequestSchema.parse({
      transcript: 'das kilo aloo hai',
      knownItems: ['aloo'],
    })
    expect(ok.transcript).toBe('das kilo aloo hai')
    expect(ok.knownItems).toEqual(['aloo'])
  })
})

