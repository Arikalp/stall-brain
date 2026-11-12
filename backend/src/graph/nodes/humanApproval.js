import { interrupt } from '@langchain/langgraph'
import {
  EnrichedForecastResultSchema,
  normalizeLlmForecast,
} from '../../schemas.js'
import { parseQuantity } from './validate.js'
import { computePlanFinancials } from '../../utils/economics.js'

/**
 * Human-in-the-loop node (T1.8): pauses the graph after `explain` and waits
 * for the vendor's approval via the resume endpoint (POST /api/forecast/resume,
 * which invokes the graph with `new Command({ resume })`).
 *
 * IMPORTANT: LangGraph re-runs this node from its start on resume, so
 * everything before interrupt() must stay side-effect free.
 */

/** Describes toBuy edits between the proposed and approved plan. */
export function describeEdits(originalPlan, approvedPlan) {
  const originalByName = new Map(
    (originalPlan?.procurementList ?? []).map((item) => [
      item.item.trim().toLowerCase(),
      item,
    ]),
  )

  const edits = []
  for (const item of approvedPlan?.procurementList ?? []) {
    const original = originalByName.get(item.item.trim().toLowerCase())
    if (!original) {
      edits.push({ item: item.item.trim(), field: 'toBuy', from: null, to: item.toBuy })
      continue
    }
    const originalValue = parseQuantity(original.toBuy)?.value
    const editedValue = parseQuantity(item.toBuy)?.value
    if (
      originalValue !== undefined &&
      editedValue !== undefined &&
      Math.abs(originalValue - editedValue) > 0.01
    ) {
      edits.push({ item: item.item.trim(), field: 'toBuy', from: original.toBuy, to: item.toBuy })
    }
  }
  return edits
}

export async function humanApproval(state) {
  if (!state.plan) {
    throw new Error('humanApproval node reached without a plan')
  }

  // T3.5: What-If simulation mode never pauses for approval or writes to Firestore.
  if (state.simulation) {
    return {
      approvedPlan: state.plan,
      approvedEdits: [],
      trace: ['Simulation mode: skipped human approval'],
    }
  }

  // Pause here; the vendor's decision arrives as the resume value:
  // { approved: boolean, editedPlan?: ForecastResult }
  const decision = interrupt({
    plan: state.plan,
    trace: state.trace,
    runId: state.runId,
  })

  if (decision?.approved === false) {
    return {
      approvedPlan: null,
      approvalRejections: 1,
      trace: ['Vendor rejected the plan - regenerating'],
    }
  }

  if (decision?.editedPlan) {
    try {
      const parsedPlan = EnrichedForecastResultSchema.parse(
        normalizeLlmForecast(decision.editedPlan),
      )
      const financials = computePlanFinancials({
        procurementList: parsedPlan.procurementList ?? [],
        sufficientStockItems: parsedPlan.sufficientStockItems ?? [],
        draftPlan: state.draftPlan,
        vendorPrices: state.itemPrices,
        signalPrices: state.signals?.prices,
        budgetInr: state.budgetInr,
      })
      const approvedPlan = { ...parsedPlan, financials }
      const edits = describeEdits(state.plan, approvedPlan)
      return {
        approvedPlan,
        approvedEdits: edits,
        trace: [
          `Vendor approved with ${edits.length} edit(s)${edits.length ? `: ${edits.map((edit) => `${edit.item} ${edit.from}->${edit.to}`).join(', ')}` : ''}`,
        ],
      }
    } catch (error) {
      return {
        approvedPlan: state.plan,
        approvedEdits: [],
        trace: ['Vendor edits failed validation - saving the original plan'],
      }
    }
  }

  return {
    approvedPlan: state.plan,
    approvedEdits: [],
    trace: ['Vendor approved the plan as-is'],
  }
}
