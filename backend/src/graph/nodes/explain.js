/**
 * Bilingual explanation node. The planner already produces summary/hindiSummary
 * today; T1.7 will generate them here from the validated plan + signals.
 */
export async function explain(state) {
  if (!state.plan) {
    throw new Error('explain node reached without a validated plan')
  }

  return {
    trace: [`Explained plan (confidence: ${state.plan.confidenceLevel})`],
  }
}
