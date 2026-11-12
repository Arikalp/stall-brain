import { getLlm } from '../../llm.js'
import { ExplanationSchema } from '../../schemas.js'
import { describeBiasAdjustments } from '../../learning/bias.js'
import { computePlanFinancials } from '../../utils/economics.js'

/**
 * Bilingual explanation node (T1.7): generates summary, hindiSummary,
 * peakHours, specialAdvice and confidenceReason from the VALIDATED plan +
 * signals, after the validator loop. The procurement numbers themselves are
 * never changed here.
 *
 * One structured LLM call with a deterministic code fallback so bilingual
 * output always exists and its numbers always match the plan.
 */

const SYSTEM_PROMPT = `You write a short daily briefing for a street vendor in Hazratganj, Lucknow, based on an already-validated procurement plan.
Respond ONLY as JSON with these keys:
{
  "summary": "1-2 simple sentences in English describing today's plan and conditions",
  "hindiSummary": "same meaning in simple spoken Hindi (Devanagari), not formal or Sanskritized",
  "peakHours": "the busy hours, e.g. 12-2pm and 6-9pm",
  "specialAdvice": "one actionable tip in English, then ' || ', then the same tip in simple Hindi",
  "confidenceReason": "one short sentence explaining the confidence level"
}
Rules:
- Use the EXACT quantities and item names from the plan where you mention them. Never invent or change numbers.
- Hindi must be simple, spoken-style Hindi a street vendor uses every day.
- Do not add keys beyond the schema.`

function weatherLine(signals) {
  const weather = signals?.weather
  if (!weather) return 'Weather unknown'
  return `${weather.label}${weather.temperature != null ? `, about ${weather.temperature}°C` : ''}`
}

function eventsLine(signals) {
  const parts = []
  if (signals?.festivals?.length) {
    parts.push(`Festivals: ${signals.festivals.map((festival) => festival.name).join(', ')}`)
  }
  if (signals?.events?.length) {
    parts.push(`Events: ${signals.events.map((event) => event.name).join(', ')}`)
  }
  if (signals?.match) {
    parts.push(`Cricket: ${signals.match.teams} at ${signals.match.startTime} (${signals.match.expectedCrowd} crowd)`)
  }
  return parts.join('; ') || 'No special events reported today.'
}

export function buildExplanationPrompt(state) {
  const plan = state.plan
  const items = plan.procurementList ?? []

  const itemLines = items.length
    ? items
        .map(
          (item) =>
            `- ${item.item}: buy ${item.toBuy} (need ${item.totalNeeded}, have ${item.alreadyHave}) - ${item.priority}`,
        )
        .join('\n')
    : '- Everything is already in stock; no purchases needed.'

  const sufficient = plan.sufficientStockItems?.length
    ? `\nSufficient stock already: ${plan.sufficientStockItems.join(', ')}`
    : ''

  const toolErrors = state.signals?.errors ?? []
  const errorNote = toolErrors.length
    ? `\nSome live signals failed (${toolErrors.join('; ')}); the confidence level is ${plan.confidenceLevel} - mention the missing data in confidenceReason.`
    : ''

  // T2.3: Tell the LLM which items had their quantities adjusted by the bias
  // engine so it can mention this naturally in the bilingual summary.
  const weekday = state.date ? new Date(`${state.date}T00:00:00+05:30`).getDay() : null
  const biasLines = describeBiasAdjustments(state.bias, state.sessionIngredients, weekday)
  const biasNote = biasLines.length
    ? `\nLEARNED ADJUSTMENTS (mention naturally in specialAdvice or confidenceReason):\n${biasLines.map((line) => `- ${line}`).join('\n')}`
    : ''

  const financials =
    plan.financials ??
    computePlanFinancials({
      procurementList: plan.procurementList ?? [],
      sufficientStockItems: plan.sufficientStockItems ?? [],
      draftPlan: state.draftPlan,
      vendorPrices: state.itemPrices,
      signalPrices: state.signals?.prices,
      budgetInr: state.budgetInr,
    })

  const econNote =
    financials.totalCostInr > 0 || financials.expectedRevenueInr > 0
      ? `\nEconomics (code-computed): est. cost ₹${financials.totalCostInr}, expected revenue ₹${financials.expectedRevenueInr}, expected profit ₹${financials.expectedProfitInr} (${financials.marginPercent}% margin)${financials.budgetInr != null ? `, budget cap ₹${financials.budgetInr}` : ''}`
      : ''

  const lookaheadNote = buildTomorrowOutlook(state.signals, state.draftPlan)
    ? `\nTomorrow & 3-day outlook: ${buildTomorrowOutlook(state.signals, state.draftPlan)}`
    : ''

  return `Date: ${state.request?.dateLabel ?? 'today'} (${state.request?.dayName ?? ''})
Stall: ${state.profile?.stallLabel ?? ''}
Weather: ${weatherLine(state.signals)}
${eventsLine(state.signals)}
Combined demand multiplier: x${state.multiplier?.combined ?? 1}

VALIDATED PLAN (do not change any numbers):
${itemLines}${sufficient}
Expected customers: ${plan.expectedCustomers}
Confidence: ${plan.confidenceLevel}${econNote}${lookaheadNote}${errorNote}${biasNote}

Write the briefing.`
}

/**
 * Builds a concise bilingual Tomorrow & 3-day outlook string from signals.lookahead (T3.4).
 */
export function buildTomorrowOutlook(signals, draftPlan = null) {
  const lookahead = Array.isArray(signals?.lookahead) ? signals.lookahead : []
  const tomorrow = lookahead[1]
  const dayPlus2 = lookahead[2]
  if (!tomorrow && !dayPlus2) return ''

  const partsEn = []
  const partsHi = []

  if (tomorrow) {
    const wLabel = tomorrow.weather?.label ?? 'Weather normal'
    const rainNote =
      tomorrow.weather?.rainProbabilityPeak >= 50
        ? ` (${tomorrow.weather.rainProbabilityPeak}% rain chance)`
        : ''
    const evNames = [
      ...(tomorrow.festivals ?? []).map((f) => f.name),
      ...(tomorrow.events ?? []).map((e) => e.name),
      ...(tomorrow.match ? [`Cricket: ${tomorrow.match.teams}`] : []),
    ]
    const evText = evNames.length ? `; ${evNames.join(', ')}` : ''
    const badTomorrow =
      (tomorrow.weather?.footfallImpact ?? 1) < 0.85 ||
      (tomorrow.weather?.rainProbabilityPeak ?? 0) >= 65

    partsEn.push(
      `Tomorrow (${tomorrow.date}): ${wLabel}${rainNote}${evText}.${
        badTomorrow
          ? ' Today’s short-life perishables kept lean to avoid spoilage.'
          : evNames.length
            ? ' Busy day ahead — dry goods pre-buffered.'
            : ''
      }`,
    )
    partsHi.push(
      `कल (${tomorrow.date}): ${wLabel}${rainNote}${evText}।${
        badTomorrow
          ? ' खराब मौसम के कारण आज जल्दी खराब होने वाला सामान कम रखा गया है।'
          : evNames.length
            ? ' कल ज़्यादा भीड़ रहेगी — सूखा सामान थोड़ा बढ़ाया गया है।'
            : ''
      }`,
    )
  }

  if (dayPlus2) {
    const d2Events = [
      ...(dayPlus2.festivals ?? []).map((f) => f.name),
      ...(dayPlus2.events ?? []).map((e) => e.name),
      ...(dayPlus2.match ? [`Cricket: ${dayPlus2.match.teams}`] : []),
    ]
    if (d2Events.length || dayPlus2.weather?.label) {
      partsEn.push(`Day+2 (${dayPlus2.date}): ${dayPlus2.weather?.label ?? ''}${d2Events.length ? ` — ${d2Events.join(', ')}` : ''}.`)
    }
  }

  if (draftPlan?.spoilageGuardApplied && partsEn.length === 0) {
    partsEn.push('Perishable shelf-life caps applied today.')
  }

  return `${partsEn.join(' ')} || ${partsHi.join(' ')}`.replace(/\s*\|\|\s*$/, '')
}

/** Deterministic fallback: bilingual text built from plan numbers in code. */
export function buildFallbackExplanation(state) {
  const plan = state.plan
  const items = plan.procurementList ?? []
  const names = items.map((item) => item.item)
  const firstQuantities = items
    .slice(0, 3)
    .map((item) => `${item.toBuy} ${item.item}`)
    .join(', ')

  const summary = names.length
    ? `Buy today: ${firstQuantities}${items.length > 3 ? ` and ${items.length - 3} more item(s)` : ''}. ${weatherLine(state.signals)}. ${eventsLine(state.signals)}.`
    : `No purchases needed today - your stock covers the plan. ${weatherLine(state.signals)}.`

  const hindiSummary = names.length
    ? `आज यह खरीदें: ${firstQuantities}${items.length > 3 ? ` और ${items.length - 3} चीज़ें और` : ''}। मौसम: ${weatherLine(state.signals)}।`
    : 'आज कुछ खरीदने की ज़रूरत नहीं है - आपका स्टॉक काफ़ी है।'

  const adviceEn =
    items.length >= 3
      ? 'Reach the market early so the freshest stock is yours.'
      : 'Double-check your stock before leaving for the market.'
  const adviceHi =
    items.length >= 3
      ? 'जल्दी मंडी पहुँचें ताकि ताज़ा माल आपको मिले।'
      : 'मंडी जाने से पहले अपना स्टॉक एक बार जांच लें।'

  return {
    summary,
    hindiSummary,
    peakHours: '12-2pm and 6-9pm',
    specialAdvice: `${adviceEn} || ${adviceHi}`,
    confidenceReason: plan.confidenceReason,
  }
}

/**
 * Light code check: the explanation must reference the plan's actual numbers.
 * If the LLM text mentions none of the plan quantities, use the fallback.
 */
export function numbersMatchPlan(explanation, plan) {
  const items = plan?.procurementList ?? []
  if (!items.length) return true
  const text = `${explanation.summary} ${explanation.hindiSummary}`
  const quantityTokens = items.map((item) =>
    String(item.toBuy).split(/\s+/)[0].replace(/[^\d.]/g, ''),
  )
  return quantityTokens.some((token) => token && text.includes(token))
}

export async function explain(state, deps = {}) {
  if (!state.plan) {
    throw new Error('explain node reached without a validated plan')
  }

  let explanation
  let method = 'llm'

  if (deps.skipLlm) {
    explanation = buildFallbackExplanation(state)
    method = 'fallback'
  } else {
    try {
      const llm = deps.llm ?? getLlm()
      const structuredLlm = llm.withStructuredOutput(ExplanationSchema)
      const result = await structuredLlm.invoke([
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildExplanationPrompt(state) },
      ])
      const parsed = ExplanationSchema.parse(result)
      explanation = numbersMatchPlan(parsed, state.plan)
        ? parsed
        : buildFallbackExplanation(state)
      method = explanation === parsed ? 'llm' : 'fallback'
    } catch (error) {
      // Graceful degradation: deterministic bilingual text, never crash the run.
      explanation = buildFallbackExplanation(state)
      method = 'fallback'
      console.warn('[explain] LLM explanation failed, using deterministic text:', error?.message)
    }
  }

  const financials =
    state.plan.financials ??
    computePlanFinancials({
      procurementList: state.plan.procurementList ?? [],
      sufficientStockItems: state.plan.sufficientStockItems ?? [],
      draftPlan: state.draftPlan,
      vendorPrices: state.itemPrices,
      signalPrices: state.signals?.prices,
      budgetInr: state.budgetInr,
    })

  const tomorrowOutlook = buildTomorrowOutlook(state.signals, state.draftPlan) || null

  return {
    plan: {
      ...state.plan,
      summary: explanation.summary,
      hindiSummary: explanation.hindiSummary,
      peakHours: explanation.peakHours,
      specialAdvice: explanation.specialAdvice,
      confidenceReason: explanation.confidenceReason,
      financials,
      tomorrowOutlook,
      perishableNotes: state.draftPlan?.perishableNotes ?? [],
      ...(state.simulation ? { simulation: true } : {}),
    },
    trace: [
      `Explained plan (${method === 'fallback' ? 'deterministic fallback text' : 'LLM briefing'}, confidence: ${state.plan.confidenceLevel})`,
    ],
  }
}
