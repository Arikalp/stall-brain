import { describe, expect, it } from 'vitest'
import {
  buildFallbackExplanation,
  buildExplanationPrompt,
  explain,
  numbersMatchPlan,
} from '../src/graph/nodes/explain.js'

const state = {
  plan: {
    summary: 'placeholder',
    hindiSummary: 'placeholder',
    expectedCustomers: 180,
    peakHours: 'x',
    confidenceLevel: 'Medium',
    confidenceReason: 'some rain',
    procurementList: [
      { item: 'aloo', totalNeeded: '14.4 kg', alreadyHave: '4 kg', toBuy: '10.4 kg', unit: 'kg', priority: 'essential' },
      { item: 'puri', totalNeeded: '360 pieces', alreadyHave: '0 pieces', toBuy: '360 pieces', unit: 'pieces', priority: 'essential' },
    ],
    sufficientStockItems: ['imli chutney'],
    specialAdvice: 'x || y',
  },
  profile: { stallType: 'chaat', stallLabel: 'Chaat Stall' },
  request: { dateLabel: '12 November 2026', dayName: 'Thursday' },
  signals: {
    weather: { label: 'Clear & Sunny ☀️', temperature: 28, footfallImpact: 1.2 },
    events: [],
    festivals: [{ name: 'Diwali', expectedFootfall: 'high' }],
    match: null,
    errors: [],
  },
  multiplier: { combined: 1.2 },
}

describe('explain (T1.7)', () => {
  it('deterministic fallback includes both languages and plan numbers', async () => {
    const update = await explain(state, { skipLlm: true })
    const plan = update.plan

    expect(plan.summary).toContain('10.4')
    expect(plan.hindiSummary).toContain('आज')
    expect(plan.specialAdvice).toContain(' || ')
    expect(plan.confidenceLevel).toBe('Medium') // unchanged by explain
    expect(update.trace[0]).toContain('fallback')
  })

  it('builds a prompt referencing the validated numbers and signals', () => {
    const prompt = buildExplanationPrompt(state)
    expect(prompt).toContain('10.4 kg')
    expect(prompt).toContain('Diwali')
    expect(prompt).toContain('28°C')
    expect(prompt).toContain('do not change any numbers')
  })

  it('mentions signal errors and lowered confidence in the prompt', () => {
    const errored = {
      ...state,
      signals: { ...state.signals, errors: ['getWeather: network down'] },
    }
    const prompt = buildExplanationPrompt(errored)
    expect(prompt).toContain('getWeather')
    expect(prompt).toContain('Medium')
  })

  it('numbersMatchPlan accepts plan references and rejects invented ones', () => {
    expect(
      numbersMatchPlan({ summary: 'buy 10.4', hindiSummary: 'x' }, state.plan),
    ).toBe(true)
    expect(
      numbersMatchPlan({ summary: 'buy 99 apples', hindiSummary: 'x' }, state.plan),
    ).toBe(false)
  })

  it('handles an empty procurement list', async () => {
    const emptyState = { ...state, plan: { ...state.plan, procurementList: [] } }
    const update = await explain(emptyState, { skipLlm: true })
    expect(update.plan.summary).toContain('No purchases')
  })
})
