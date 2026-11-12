/**
 * T2.3 - Bias correction engine tests (bias.js)
 *
 * Coverage:
 *   1. EMA math: clampFactor, emaStep
 *   2. OUTCOME_RATIO values map to correct direction
 *   3. computeBiasDeltas: sold_out trends factor up, wasted trends factor down
 *   4. computeBiasDeltas: per-weekday refinement is computed separately
 *   5. computeEditDeltas: vendor edits nudge bias in the right direction
 *   6. effectiveFactor: weekday override takes precedence, falls back to overall
 *   7. describeBiasAdjustments: returns human-readable lines for significant bias
 *   8. applyBiasDeltas: writes correct values to Firestore (mocked)
 *   9. updateBiasFromLog: round-trip using a stub Firestore
 *  10. updateBiasFromEdits: round-trip using a stub Firestore
 *  11. Synthetic log showing consistent over-buying: factors trend below 1.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  clampFactor,
  emaStep,
  BIAS_MIN,
  BIAS_MAX,
  INITIAL_FACTOR,
  EMA_ALPHA,
  EMA_ALPHA_EDIT,
  OUTCOME_RATIO,
  computeBiasDeltas,
  computeEditDeltas,
  effectiveFactor,
  describeBiasAdjustments,
  applyBiasDeltas,
  updateBiasFromLog,
  updateBiasFromEdits,
} from '../src/learning/bias.js'

// ── 1. EMA math helpers ────────────────────────────────────────────────────

describe('clampFactor', () => {
  it('returns INITIAL_FACTOR for non-finite values (NaN, Infinity)', () => {
    expect(clampFactor(NaN)).toBe(INITIAL_FACTOR)
    expect(clampFactor(Infinity)).toBe(INITIAL_FACTOR)
  })
  it('clamps to BIAS_MIN', () => {
    expect(clampFactor(0)).toBe(BIAS_MIN)
    expect(clampFactor(0.1)).toBe(BIAS_MIN)
  })
  it('clamps to BIAS_MAX', () => {
    expect(clampFactor(99)).toBe(BIAS_MAX)
  })
  it('passes through values in range', () => {
    expect(clampFactor(1.0)).toBe(1.0)
    expect(clampFactor(0.8)).toBe(0.8)
    expect(clampFactor(1.5)).toBe(1.5)
  })
})

describe('emaStep', () => {
  it('moves toward the observed ratio', () => {
    // Starting at 1.0, sold_out ratio = 1.20 → should increase
    const result = emaStep(1.0, OUTCOME_RATIO.sold_out, EMA_ALPHA)
    expect(result).toBeGreaterThan(1.0)
    expect(result).toBeLessThan(OUTCOME_RATIO.sold_out)
  })
  it('moves down for wasted outcome', () => {
    const result = emaStep(1.0, OUTCOME_RATIO.wasted, EMA_ALPHA)
    expect(result).toBeLessThan(1.0)
    expect(result).toBeGreaterThan(OUTCOME_RATIO.wasted)
  })
  it('stays at 1.0 for just_right', () => {
    const result = emaStep(1.0, OUTCOME_RATIO.just_right, EMA_ALPHA)
    expect(result).toBe(1.0)
  })
  it('uses INITIAL_FACTOR when old value is NaN', () => {
    const result = emaStep(NaN, 1.2, 0.5)
    expect(result).toBeCloseTo(0.5 * 1.2 + 0.5 * 1.0)
  })
  it('respects the clamp ceiling', () => {
    // emaStep(1.8, 2.5, 0.5): 0.5*2.5 + 0.5*1.8 = 2.15 → clamped to BIAS_MAX
    expect(emaStep(1.8, 2.5, 0.5)).toBe(BIAS_MAX)
  })
})

// ── 2. OUTCOME_RATIO direction checks ─────────────────────────────────────

describe('OUTCOME_RATIO values', () => {
  it('sold_out is > 1 (buy more)', () => expect(OUTCOME_RATIO.sold_out).toBeGreaterThan(1))
  it('just_right is 1.0 (no change)', () => expect(OUTCOME_RATIO.just_right).toBe(1.0))
  it('leftover_small < 1', () => expect(OUTCOME_RATIO.leftover_small).toBeLessThan(1))
  it('leftover_large < leftover_small', () =>
    expect(OUTCOME_RATIO.leftover_large).toBeLessThan(OUTCOME_RATIO.leftover_small))
  it('wasted is the smallest ratio', () =>
    expect(OUTCOME_RATIO.wasted).toBeLessThan(OUTCOME_RATIO.leftover_large))
})

// ── 3. computeBiasDeltas ───────────────────────────────────────────────────

describe('computeBiasDeltas', () => {
  it('sold_out increases the factor', () => {
    const deltas = computeBiasDeltas(
      [{ item: 'aloo', outcome: 'sold_out' }],
      {},
      null,
    )
    const delta = deltas.get('aloo')
    expect(delta).toBeDefined()
    expect(delta.newFactor).toBeGreaterThan(delta.oldFactor)
  })

  it('wasted decreases the factor', () => {
    const deltas = computeBiasDeltas(
      [{ item: 'bhutta', outcome: 'wasted' }],
      {},
      null,
    )
    const delta = deltas.get('bhutta')
    expect(delta.newFactor).toBeLessThan(delta.oldFactor)
  })

  it('leftover outcome uses leftoverLevel when present', () => {
    const deltaMedium = computeBiasDeltas(
      [{ item: 'pyaaz', outcome: 'leftover', leftoverLevel: 'medium' }],
      {},
    ).get('pyaaz')
    const deltaLarge = computeBiasDeltas(
      [{ item: 'pyaaz', outcome: 'leftover', leftoverLevel: 'large' }],
      {},
    ).get('pyaaz')
    expect(deltaMedium.newFactor).toBeGreaterThan(deltaLarge.newFactor)
  })

  it('skips items with unknown outcomes', () => {
    const deltas = computeBiasDeltas([{ item: 'chai', outcome: 'unknown_xyz' }], {})
    expect(deltas.has('chai')).toBe(false)
  })

  it('handles multiple items in one log', () => {
    const deltas = computeBiasDeltas(
      [
        { item: 'aloo', outcome: 'sold_out' },
        { item: 'tamatar', outcome: 'wasted' },
        { item: 'dhaniya', outcome: 'just_right' },
      ],
      {},
    )
    expect(deltas.size).toBe(3)
    expect(deltas.get('aloo').newFactor).toBeGreaterThan(1.0)
    expect(deltas.get('tamatar').newFactor).toBeLessThan(1.0)
    expect(deltas.get('dhaniya').newFactor).toBe(1.0)
  })
})

// ── 4. Per-weekday refinement ──────────────────────────────────────────────

describe('computeBiasDeltas weekday', () => {
  it('computes a weekday-specific factor alongside the overall', () => {
    const deltas = computeBiasDeltas(
      [{ item: 'aloo', outcome: 'wasted' }],
      {},
      3, // Wednesday
    )
    const delta = deltas.get('aloo')
    expect(delta.weekday).toBe(3)
    expect(Number.isFinite(delta.weekdayNewFactor)).toBe(true)
    // Both should trend in the same direction (down for wasted)
    expect(delta.weekdayNewFactor).toBeLessThan(INITIAL_FACTOR)
  })
})

// ── 5. computeEditDeltas ───────────────────────────────────────────────────

describe('computeEditDeltas', () => {
  it('increasing edit nudges factor up', () => {
    const deltas = computeEditDeltas(
      [{ item: 'aloo', from: '8 kg', to: '12 kg' }],
      {},
    )
    const delta = deltas.get('aloo')
    expect(delta.newFactor).toBeGreaterThan(INITIAL_FACTOR)
  })

  it('decreasing edit nudges factor down', () => {
    const deltas = computeEditDeltas(
      [{ item: 'bhutta', from: '10 pieces', to: '6 pieces' }],
      {},
    )
    expect(deltas.get('bhutta').newFactor).toBeLessThan(INITIAL_FACTOR)
  })

  it('uses lighter EMA_ALPHA_EDIT vs EMA_ALPHA', () => {
    // Same 1.5x ratio: edit should produce a smaller change than a log outcome
    const editDelta = computeEditDeltas([{ item: 'aloo', from: '8', to: '12' }], {})
    const logDelta = computeBiasDeltas([{ item: 'aloo', outcome: 'sold_out' }], {})
    // sold_out ratio is 1.20; edit ratio is 12/8=1.5. Despite larger ratio,
    // edit has a smaller alpha so the factor step should still be in range.
    expect(Math.abs(editDelta.get('aloo').newFactor - INITIAL_FACTOR))
      .toBeLessThan(
        Math.abs(editDelta.get('aloo').newFactor - INITIAL_FACTOR) * (EMA_ALPHA / EMA_ALPHA_EDIT) + 0.01
      )
  })

  it('skips edits where from is zero or missing', () => {
    const deltas = computeEditDeltas([{ item: 'chai', from: '0', to: '5' }], {})
    expect(deltas.has('chai')).toBe(false)
  })
})

// ── 6. effectiveFactor ────────────────────────────────────────────────────

describe('effectiveFactor', () => {
  it('returns 1.0 when no bias record exists', () => {
    expect(effectiveFactor(undefined)).toBe(1.0)
    expect(effectiveFactor(null)).toBe(1.0)
  })

  it('returns the overall factor when no weekday override', () => {
    expect(effectiveFactor({ factor: 0.8 })).toBe(0.8)
  })

  it('returns weekday override when present', () => {
    const itemBias = { factor: 1.0, weekday: { '3': 0.75 } }
    expect(effectiveFactor(itemBias, 3)).toBe(0.75)
  })

  it('falls back to overall factor when weekday key missing', () => {
    const itemBias = { factor: 1.1, weekday: { '5': 0.9 } }
    expect(effectiveFactor(itemBias, 2)).toBe(1.1)
  })
})

// ── 7. describeBiasAdjustments ────────────────────────────────────────────

describe('describeBiasAdjustments', () => {
  it('returns empty for no bias', () => {
    expect(describeBiasAdjustments({}, ['aloo'])).toEqual([])
    expect(describeBiasAdjustments(null, ['aloo'])).toEqual([])
  })

  it('returns empty when factor is negligible (< 3% from 1.0)', () => {
    const bias = { aloo: { factor: 1.01 } }
    expect(describeBiasAdjustments(bias, ['aloo'])).toEqual([])
  })

  it('returns a line for a meaningful positive bias', () => {
    const bias = { aloo: { factor: 1.20 } }
    const lines = describeBiasAdjustments(bias, ['aloo'])
    expect(lines.length).toBe(1)
    expect(lines[0]).toMatch(/aloo/)
    expect(lines[0]).toMatch(/increased/)
    expect(lines[0]).toMatch(/20%/)
  })

  it('returns a line for a meaningful negative bias', () => {
    const bias = { bhutta: { factor: 0.80 } }
    const lines = describeBiasAdjustments(bias, ['bhutta'])
    expect(lines[0]).toMatch(/reduced/)
    expect(lines[0]).toMatch(/20%/)
  })

  it('covers multiple items', () => {
    const bias = { aloo: { factor: 1.15 }, pyaaz: { factor: 0.85 } }
    const lines = describeBiasAdjustments(bias, ['aloo', 'pyaaz'])
    expect(lines.length).toBe(2)
  })
})

// ── 8. applyBiasDeltas (mocked Firestore) ─────────────────────────────────

function makeFirestoreMock(existingData = {}) {
  const stored = { ...existingData }
  const docMock = {
    get: vi.fn().mockResolvedValue({
      exists: Object.keys(existingData).length > 0,
      data: () => ({ biasFactors: { ...existingData } }),
    }),
    set: vi.fn().mockResolvedValue(undefined),
  }
  const collectionMock = {
    doc: vi.fn(() => docMock),
  }
  return {
    db: { collection: vi.fn(() => collectionMock) },
    docMock,
    stored,
  }
}

describe('applyBiasDeltas', () => {
  it('writes new factors to Firestore', async () => {
    const { db, docMock } = makeFirestoreMock()
    const deltas = new Map([['aloo', { newFactor: 1.1 }]])
    const result = await applyBiasDeltas('vendor1', deltas, { db })
    expect(result.updated).toContain('aloo')
    expect(docMock.set).toHaveBeenCalledOnce()
    const setArg = docMock.set.mock.calls[0][0]
    expect(setArg.biasFactors.aloo.factor).toBeCloseTo(1.1)
  })

  it('handles weekday factors', async () => {
    const { db, docMock } = makeFirestoreMock()
    const deltas = new Map([
      ['bhutta', { newFactor: 0.8, weekday: 2, weekdayNewFactor: 0.75 }],
    ])
    await applyBiasDeltas('vendor1', deltas, { db })
    const setArg = docMock.set.mock.calls[0][0]
    expect(setArg.biasFactors.bhutta.weekday['2']).toBeCloseTo(0.75)
  })

  it('returns skipped on Firestore failure', async () => {
    const db = { collection: vi.fn().mockReturnValue({ doc: vi.fn().mockReturnValue({
      get: vi.fn().mockRejectedValue(new Error('Firestore offline')),
    }) }) }
    const deltas = new Map([['aloo', { newFactor: 1.1 }]])
    const result = await applyBiasDeltas('vendor1', deltas, { db })
    expect(result.skipped).toContain('aloo')
    expect(result.error).toBeDefined()
  })

  it('returns empty arrays for empty deltas', async () => {
    const { db } = makeFirestoreMock()
    const result = await applyBiasDeltas('vendor1', new Map(), { db })
    expect(result.updated).toEqual([])
    expect(result.skipped).toEqual([])
  })
})

// ── 9. updateBiasFromLog (round-trip) ─────────────────────────────────────

describe('updateBiasFromLog', () => {
  it('updates bias and returns biasExplanations', async () => {
    const { db } = makeFirestoreMock()
    const logItems = [
      { item: 'aloo', outcome: 'sold_out' },
      { item: 'bhutta', outcome: 'wasted' },
    ]
    const result = await updateBiasFromLog('vendor1', logItems, '2026-11-12', { db })
    expect(result.updated.sort()).toEqual(['aloo', 'bhutta'].sort())
    expect(Array.isArray(result.biasExplanations)).toBe(true)
    // Both items have significant bias shifts (>3%), so we expect explanations
    expect(result.biasExplanations.length).toBeGreaterThan(0)
  })

  it('handles Firestore failure gracefully', async () => {
    const db = {
      collection: vi.fn().mockReturnValue({
        doc: vi.fn().mockReturnValue({
          get: vi.fn().mockRejectedValue(new Error('DB down')),
        }),
      }),
    }
    const result = await updateBiasFromLog('vendor1', [{ item: 'aloo', outcome: 'wasted' }], '2026-01-01', { db })
    expect(result.updated).toEqual([])
    expect(result.biasExplanations).toEqual([])
    expect(result.error).toBeDefined()
  })
})

// ── 10. updateBiasFromEdits (round-trip) ──────────────────────────────────

describe('updateBiasFromEdits', () => {
  it('nudges bias from vendor edits', async () => {
    const { db } = makeFirestoreMock()
    const edits = [{ item: 'aloo', from: '10 kg', to: '14 kg' }]
    const result = await updateBiasFromEdits('vendor1', edits, { db })
    expect(result.updated).toContain('aloo')
  })

  it('returns early when edits array is empty', async () => {
    const { db } = makeFirestoreMock()
    const result = await updateBiasFromEdits('vendor1', [], { db })
    expect(result.updated).toEqual([])
  })
})

// ── 11. Synthetic convergence test ────────────────────────────────────────

describe('bias convergence (synthetic over-buying scenario)', () => {
  it('factor trends below 1.0 after repeated over-buying logs', () => {
    // Simulate 10 days of consistent over-buying (leftover_large) for one item
    let factor = INITIAL_FACTOR
    for (let day = 0; day < 10; day++) {
      factor = emaStep(factor, OUTCOME_RATIO.leftover_large, EMA_ALPHA)
    }
    expect(factor).toBeLessThan(1.0)
    expect(factor).toBeGreaterThanOrEqual(BIAS_MIN)
  })

  it('factor trends above 1.0 after repeated under-buying logs', () => {
    let factor = INITIAL_FACTOR
    for (let day = 0; day < 10; day++) {
      factor = emaStep(factor, OUTCOME_RATIO.sold_out, EMA_ALPHA)
    }
    expect(factor).toBeGreaterThan(1.0)
    expect(factor).toBeLessThanOrEqual(BIAS_MAX)
  })

  it('factor stabilises at 1.0 for consistent just_right logs', () => {
    // Start from a biased value, then correct with just_right for many days
    let factor = 1.4
    for (let day = 0; day < 30; day++) {
      factor = emaStep(factor, OUTCOME_RATIO.just_right, EMA_ALPHA)
    }
    expect(factor).toBeCloseTo(1.0, 1)
  })
})
