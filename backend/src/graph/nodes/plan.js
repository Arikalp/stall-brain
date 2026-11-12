import { getLlm } from '../../llm.js'
import {
  ForecastResultSchema,
  normalizeLlmForecast,
} from '../../schemas.js'

// Kept close to the prompt the frontend used before the key moved server-side.
// Exported so tests can assert on the confidence/tool-error rules.
export const SYSTEM_PROMPT = `You are Bazaar Brain, an AI demand forecaster for street vendors in Lucknow.
Respond ONLY in the following JSON format, with no markdown and no extra keys:
{
  "summary": "one sentence overview of today",
  "hindiSummary": "same in Hindi",
  "expectedCustomers": number,
  "peakHours": "e.g. 12-2pm and 6-9pm",
  "confidenceLevel": "High" | "Medium" | "Low",
  "confidenceReason": "short reason",
  "procurementList": [
    {
      "item": "aloo",
      "totalNeeded": "12 kg",
      "alreadyHave": "4 kg",
      "toBuy": "8 kg",
      "unit": "kg",
      "priority": "essential",
      "note": "Optional short note"
    }
  ],
  "sufficientStockItems": ["imli chutney"],
  "specialAdvice": "English tip || Hindi tip"
}
Rules:
- specialAdvice must be one actionable tip in English, then "||", then the Hindi version.
- procurementList priorities must be one of: essential, moderate, optional.
- expectedCustomers must be a number (no quotes).
- totalNeeded, alreadyHave, and toBuy must include quantities with units (e.g. "12 kg").
- If an item has sufficient stock, omit it from procurementList and list it in sufficientStockItems.
- Do not include any keys beyond the schema.
- If SIGNAL ERRORS are listed below, confidenceLevel must be "Medium" or "Low", and mention the missing signal in confidenceReason.
- You may adjust the DETERMINISTIC DRAFT quantities by at most +/-25% to account for
  edge cases the math cannot see (spoilage, carry-over stock, price spikes, unusual events).
  Every adjusted item MUST include a short "note" explaining the adjustment; do not recompute
  totals from scratch - start from the draft and adjust within the band.
- PROFIT & BUDGET OPTIMIZATION (when a daily budget cap is set):
  The deterministic draft is already pre-optimized to maximize expected profit within the budget.
  Prioritize high-margin and high-demand items as "essential", mark budget-trimmed or low-margin
  items "moderate" or "optional", and NEVER let total procurement cost exceed the daily budget cap.`

export function buildUserPrompt(state) {
  const payload = state.request ?? {}
  const finalItems = state.sessionIngredients ?? []

  const inventoryLines = finalItems
    .map((item) => {
      const entry = state.inventory?.[item]
      const quantity = Number(entry?.quantity)
      const unit = entry?.unit || 'units'
      if (Number.isFinite(quantity) && quantity > 0) {
        return `${item}: ${quantity} ${unit} already in stock`
      }
      return `${item}: none in stock`
    })
    .join('\n')

  const itemFin = state.draftPlan?.financials?.items ?? {}
  const draftLines = (state.draftPlan?.items ?? [])
    .map((item) => {
      const econ = itemFin[item.item]
      const priceHint =
        econ && econ.buyPrice != null
          ? ` | buy ₹${econ.buyPrice}/${item.unit}${econ.sellPrice != null ? `, sell ₹${econ.sellPrice}/${item.unit}, margin ₹${Math.round((econ.sellPrice - econ.buyPrice) * 100) / 100}/${item.unit}` : ''}, est. cost ₹${econ.costInr}`
          : ''
      return `- ${item.item}: buy ${item.toBuy} ${item.unit} (need ${item.totalNeeded}, have ${item.alreadyHave})${priceHint}`
    })
    .join('\n')

  const budgetNotes =
    state.budgetInr != null
      ? `\nDAILY BUDGET CAP: ₹${state.budgetInr} (draft est. cost ₹${state.draftPlan?.totalEstimatedCost ?? 0}, est. revenue ₹${state.draftPlan?.totalEstimatedRevenue ?? 0}, est. profit ₹${state.draftPlan?.totalEstimatedProfit ?? 0}${state.draftPlan?.budgetConstrained ? ' — TIGHT BUDGET: draft already prioritized high-margin items; do NOT exceed ₹' + state.budgetInr : ''})`
      : state.draftPlan?.totalEstimatedRevenue
        ? `\nECONOMICS ESTIMATE: est. cost ₹${state.draftPlan.totalEstimatedCost ?? 0}, est. revenue ₹${state.draftPlan.totalEstimatedRevenue}, est. profit ₹${state.draftPlan.totalEstimatedProfit ?? 0}`
        : ''

  const retryNotes =
    state.validationErrors?.length > 0
      ? `\n\nYOUR PREVIOUS OUTPUT WAS REJECTED. Fix these problems:\n${state.validationErrors
          .map((error) => `- ${error}`)
          .join('\n')}`
      : ''

  const toolErrors = state.signals?.errors ?? []
  const errorNotes =
    toolErrors.length > 0
      ? `\n\nSIGNAL ERRORS (some live data is missing, so lower your confidence and note it):\n${toolErrors
          .map((error) => `- ${error}`)
          .join('\n')}`
      : ''

  const historyNotes = (state.history ?? []).length
    ? `\n\nRECENT HISTORY (vendor-reported outcomes; use to spot systematic over/under-buying):\n${state.history
        .slice(0, 7)
        .map((log) => `- ${log.date}: ${(log.items ?? [])
          .map((entry) => `${entry.item}=${entry.outcome}`)
          .join(', ')}`)
        .join('\n')}`
    : ''

  const biasNotes =
    state.bias && Object.keys(state.bias).length
      ? `\n\nLEARNED BIAS FACTORS (already applied in the draft): ${Object.entries(state.bias)
          .map(([item, factor]) => `${item} x${factor}`)
          .join(', ')}`
      : ''

  const perishableNotes = state.draftPlan?.perishableNotes?.length
    ? `\n\nSHELF-LIFE & LOOKAHEAD NOTES (do not exceed these perishable caps):\n${state.draftPlan.perishableNotes
        .map((n) => `- ${n}`)
        .join('\n')}`
    : ''

  const socialNotes = state.signals?.socialBuzz?.hasSpike
    ? `\nSocial buzz signal: ${state.signals.socialBuzz.label} (${state.signals.socialBuzz.summary})`
    : ''

  return `Stall type: ${payload.stall?.name}
Stock items: ${finalItems.join(', ')}
The vendor sells these specific items: ${finalItems.join(', ')}

VENDOR INVENTORY CONTEXT:
Stall Type: ${payload.stall?.name}
Today's items and current stock on hand:
${inventoryLines}
${draftLines ? `\nDETERMINISTIC DRAFT PLAN (code-computed; review it, do not recompute totals):\n${draftLines}` : ''}${budgetNotes}
INSTRUCTIONS:
Generate procurement recommendations for the above items ONLY.
For each item, subtract what the vendor already has from the recommended total quantity.
If the vendor already has enough stock for the day, say "Sufficient stock" instead of recommending a purchase.
Never recommend items outside the vendor's list.
Be specific with quantities - do not give vague ranges.

Date: ${payload.dateLabel}
Day of week: ${payload.dayName}
Weather: ${payload.weather?.temperature}°C, ${state.signals?.weather?.label ?? ''}
Weather footfall impact: ${state.multiplier?.weather ?? 1}
Events today: ${state.signals?.events?.[0]?.name ?? 'No special events reported today.'}
Event impact multiplier: ${state.multiplier?.event ?? 1}
Weekly footfall multiplier for ${payload.dayName}: ${state.multiplier?.weekday ?? 1}
Combined demand multiplier (weather x event x day-of-week): ${state.multiplier?.combined ?? 1}${socialNotes}
Return precise procurement quantities and peak hours for Hazratganj, Lucknow.${errorNotes}${historyNotes}${biasNotes}${perishableNotes}${retryNotes}`
}

/**
 * LLM node: reviews the deterministic draft and produces the final plan as
 * structured output, validated against ForecastResultSchema before use.
 * On retry, validation errors are passed back in the prompt.
 */
export async function planProcurement(state) {
  const llm = getLlm()
  const structuredLlm = llm.withStructuredOutput(ForecastResultSchema)

  const result = await structuredLlm.invoke([
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: buildUserPrompt(state) },
  ])

  // Re-validate every LLM output before use (project rule).
  const plan = ForecastResultSchema.parse(normalizeLlmForecast(result))

  return {
    plan,
    trace: [
      state.retryCount > 0
        ? `Planner retry #${state.retryCount} succeeded`
        : 'Planner produced a validated plan',
    ],
  }
}
