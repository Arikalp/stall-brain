import { Router } from 'express'
import { ZodError } from 'zod'
import { requireAuth } from '../middleware/auth.js'
import { vendorRateLimit } from '../middleware/rateLimit.js'
import {
  ForecastRequestSchema,
  ForecastResultSchema,
  normalizeLlmForecast,
} from '../schemas.js'
import { getLlm } from '../llm.js'

export const forecastRouter = Router()

// Kept close to the prompt the frontend used before the key moved server-side.
const SYSTEM_PROMPT = `You are Bazaar Brain, an AI demand forecaster for street vendors in Lucknow.
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
- Do not include any keys beyond the schema.`

function buildUserPrompt(payload) {
  const finalItems =
    payload.items.length > 0 ? payload.items : payload.stall.items

  const inventoryLines = finalItems
    .map((item) => {
      const entry = payload.inventory?.[item]
      const quantity = Number(entry?.quantity)
      const unit = entry?.unit || 'units'
      if (Number.isFinite(quantity) && quantity > 0) {
        return `${item}: ${quantity} ${unit} already in stock`
      }
      return `${item}: none in stock`
    })
    .join('\n')

  return `Stall type: ${payload.stall.name}
Stock items: ${finalItems.join(', ')}
The vendor sells these specific items: ${finalItems.join(', ')}

VENDOR INVENTORY CONTEXT:
Stall Type: ${payload.stall.name}
Today's items and current stock on hand:
${inventoryLines}

INSTRUCTIONS:
Generate procurement recommendations for the above items ONLY.
For each item, subtract what the vendor already has from the recommended total quantity.
If the vendor already has enough stock for the day, say "Sufficient stock" instead of recommending a purchase.
Never recommend items outside the vendor's list.
Be specific with quantities - do not give vague ranges.

Date: ${payload.dateLabel}
Day of week: ${payload.dayName}
Weather: ${payload.weather.temperature}°C, ${payload.weatherSignal.label}
Weather footfall impact: ${payload.weatherSignal.footfallImpact}
Weather note: ${payload.weatherSignal.recommendation}
Events today: ${payload.eventSummary}
Event impact multiplier: ${payload.eventMultiplier}
Weekly footfall multiplier for ${payload.dayName}: ${payload.weeklyMultiplier}
Combined demand multiplier (weather x event x day-of-week): ${payload.demandMultiplier}
Return precise procurement quantities and peak hours for Hazratganj, Lucknow.`
}

/**
 * Calls the LLM and validates its output with the ForecastResult Zod schema.
 * Exported separately from the route so it can be smoke-tested without auth.
 */
export async function generateForecast(payload) {
  const llm = getLlm()
  // Structured output (Groq strict json_schema) forces the model into the schema;
  // we still normalize quirks and re-validate the result before trusting it.
  const structuredLlm = llm.withStructuredOutput(ForecastResultSchema)

  const result = await structuredLlm.invoke([
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: buildUserPrompt(payload) },
  ])

  // Re-validate every LLM output before use (project rule).
  return ForecastResultSchema.parse(normalizeLlmForecast(result))
}

forecastRouter.post(
  '/forecast',
  requireAuth,
  vendorRateLimit,
  async (req, res, next) => {
    const parsedBody = ForecastRequestSchema.safeParse(req.body)

    if (!parsedBody.success) {
      return res.status(400).json({
        error: 'VALIDATION_FAILED',
        message: 'Forecast request body failed validation.',
        details: parsedBody.error.flatten().fieldErrors,
      })
    }

    try {
      const result = await generateForecast(parsedBody.data)
      return res.json(result)
    } catch (error) {
      if (error instanceof ZodError) {
        console.error('[forecast] LLM output failed schema validation:', {
          issues: error.issues,
        })
        return res.status(502).json({
          error: 'FORECAST_INVALID',
          message: 'The forecast response did not match the expected schema.',
        })
      }
      return next(error)
    }
  },
)
