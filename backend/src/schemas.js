import { z } from 'zod'

/**
 * Zod schemas for every contract crossing a trust boundary:
 * - ForecastRequestSchema: the browser -> backend request body (validated at the route).
 * - ForecastResultSchema: the LLM -> backend output (validated before use, always).
 *
 * The response shape mirrors what the frontend already consumes (summary,
 * hindiSummary, procurementList, sufficientStockItems, ...) so the UI keeps working.
 */

export const InventoryEntrySchema = z.object({
  quantity: z.coerce.number().min(0).default(0),
  unit: z.string().min(1).default('units'),
})

const weatherShape = {
  temperature: z.coerce.number(),
  weathercode: z.coerce.number().default(0),
  windspeed: z.coerce.number().default(0),
}

const weatherSignalShape = {
  label: z.string().min(1),
  footfallImpact: z.coerce.number(),
  recommendation: z.string().default(''),
}

export const ForecastRequestSchema = z.object({
  stall: z.object({
    id: z.string().optional(),
    name: z.string().min(1),
    items: z.array(z.string().min(1)).default([]),
  }),
  items: z.array(z.string().min(1)).default([]),
  inventory: z.record(z.string().min(1), InventoryEntrySchema).default({}),
  dateLabel: z.string().min(1),
  dayName: z.string().min(1),
  weather: z.object(weatherShape),
  weatherSignal: z.object(weatherSignalShape),
  eventSummary: z.string().default('No special events reported today.'),
  weeklyMultiplier: z.coerce.number(),
  eventMultiplier: z.coerce.number(),
  demandMultiplier: z.coerce.number(),
})

// NOTE: This schema must stay transform-free (no coerce/preprocess/default) so it
// can be converted to a strict JSON Schema for the LLM's structured output mode.
// LLM quirks (string numbers, wrong casing) are handled by normalizeLlmForecast().
export const ProcurementItemSchema = z.object({
  item: z.string().min(1),
  totalNeeded: z.string().min(1),
  alreadyHave: z.string().min(1),
  toBuy: z.string().min(1),
  unit: z.string().min(1),
  priority: z.enum(['essential', 'moderate', 'optional']),
  note: z.string().optional(),
})

export const ForecastResultSchema = z.object({
  summary: z.string().min(1),
  hindiSummary: z.string().min(1),
  expectedCustomers: z.number(),
  peakHours: z.string().min(1),
  confidenceLevel: z.enum(['High', 'Medium', 'Low']),
  confidenceReason: z.string().min(1),
  procurementList: z.array(ProcurementItemSchema),
  sufficientStockItems: z.array(z.string().min(1)),
  specialAdvice: z.string().min(1),
})

/**
 * Normalizes common LLM output quirks before strict validation:
 * "12" -> 12 for expectedCustomers, "high" -> "High", "ESSENTIAL" -> "essential",
 * missing sufficientStockItems -> [].
 */
export function normalizeLlmForecast(raw) {
  if (!raw || typeof raw !== 'object') return raw

  const normalized = { ...raw }

  if (typeof normalized.expectedCustomers === 'string') {
    const parsed = Number.parseFloat(normalized.expectedCustomers)
    if (Number.isFinite(parsed)) {
      normalized.expectedCustomers = parsed
    }
  }

  if (typeof normalized.confidenceLevel === 'string') {
    const value = normalized.confidenceLevel.trim().toLowerCase()
    if (value === 'high' || value === 'medium' || value === 'low') {
      normalized.confidenceLevel =
        value.charAt(0).toUpperCase() + value.slice(1)
    }
  }

  if (Array.isArray(normalized.procurementList)) {
    normalized.procurementList = normalized.procurementList.map((item) => {
      if (!item || typeof item !== 'object') return item
      return {
        ...item,
        priority:
          typeof item.priority === 'string'
            ? item.priority.toLowerCase().trim()
            : item.priority,
      }
    })
  }

  if (!Array.isArray(normalized.sufficientStockItems)) {
    normalized.sufficientStockItems = []
  }

  return normalized
}
