import { recordGroupDemand, saveRun } from '../../store/firestore.js'
import { updateBiasFromEdits } from '../../learning/bias.js'
import { parseQuantity } from './validate.js'

/**
 * Persists the run (T1.8/T2.2): the approved plan, the vendor's edits
 * (learning signal for bias correction), and the signals snapshot.
 * Degrades gracefully: a Firestore failure never crashes the run.
 *
 * T2.3: If the vendor made quantity edits during approval, those edits are
 * also fed to the bias engine (lighter EMA_ALPHA_EDIT weight) so the model
 * learns from their adjustments without waiting for end-of-day logs.
 */
export async function save(state, deps = {}) {
  if (state.simulation) {
    return { trace: ['Simulation mode: run not saved to Firestore'] }
  }

  const plan = state.approvedPlan ?? state.plan

  if (!plan) {
    return { trace: ['Save: nothing to persist'] }
  }

  const result = deps.skipFirestore
    ? { saved: false, reason: 'skipped (no Firestore in this run)' }
    : await saveRun(state.vendorId, {
        runId: state.runId,
        date: state.date,
        stallType: state.profile?.stallType ?? null,
        stallLabel: state.profile?.stallLabel ?? null,
        plan,
        approvedPlan: state.approvedPlan ?? null,
        edits: state.approvedEdits ?? [],
        signals: state.signals,
        multiplier: state.multiplier,
      }, { db: deps.db })

  // T2.3: Vendor edits are a lightweight learning signal — a milder EMA step
  // so a single intentional override doesn't destabilise the model.
  const edits = state.approvedEdits ?? []
  let biasTrace = []
  if (edits.length > 0 && state.vendorId && !deps.skipFirestore) {
    const biasResult = await updateBiasFromEdits(state.vendorId, edits, { db: deps.db }).catch(
      (error) => {
        console.warn('[save] bias-from-edits failed (non-fatal):', error?.message ?? error)
        return { updated: [], skipped: [] }
      },
    )
    if (biasResult.updated?.length) {
      biasTrace = [`Bias updated from vendor edits: ${biasResult.updated.join(', ')}`]
    }
  }

  // T3.9: If vendor opted into same-lane group buying, share anonymized buy list.
  let groupTrace = []
  if (state.groupBuyingOptIn && state.vendorId && state.date && !deps.skipFirestore) {
    const groupItems = (plan.procurementList ?? [])
      .map((row) => ({
        item: row.item,
        toBuy: parseQuantity(row.toBuy)?.value ?? 0,
        unit: row.unit,
      }))
      .filter((row) => row.toBuy > 0)
    if (groupItems.length) {
      await recordGroupDemand(
        {
          vendorId: state.vendorId,
          lane: state.lane ?? 'Hazratganj',
          date: state.date,
          items: groupItems,
          optIn: true,
        },
        { db: deps.db },
      ).catch(() => null)
      groupTrace = [`Group demand updated for ${state.lane ?? 'Hazratganj'}`]
    }
  }

  return {
    trace: [
      result.saved
        ? `Run ${state.runId} saved to Firestore`
        : `Run not persisted: ${result.reason}`,
      ...biasTrace,
      ...groupTrace,
    ],
  }
}
