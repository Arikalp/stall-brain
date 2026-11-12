import { saveRun } from '../../store/firestore.js'

/**
 * Persists the run (T1.8/T2.2): the approved plan, the vendor's edits
 * (learning signal for bias correction), and the signals snapshot.
 * Degrades gracefully: a Firestore failure never crashes the run.
 */
export async function save(state, deps = {}) {
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

  return {
    trace: [
      result.saved
        ? `Run ${state.runId} saved to Firestore`
        : `Run not persisted: ${result.reason}`,
    ],
  }
}
