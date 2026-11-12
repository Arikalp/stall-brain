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

/** Per-item wholesale buy price & realized sell price in INR (T3.2). */
export const ItemPriceSchema = z.object({
  buyPrice: z.coerce.number().min(0).nullable().optional(),
  sellPrice: z.coerce.number().min(0).nullable().optional(),
})

/** Matches src/utils/profileStorage.js on the frontend. */
export const UserProfileSchema = z.object({
  stallType: z.string().min(1),
  stallLabel: z.string().min(1),
  stallEmoji: z.string().min(1),
  ingredients: z.array(z.string().min(1)).default([]),
  dailyBudgetInr: z.coerce.number().nonnegative().nullable().optional(),
  itemPrices: z.record(z.string().min(1), ItemPriceSchema).optional(),
})

/** What the vendor's current session looks like (localStorage today, Firestore later). */
export const ForecastSessionSchema = z.object({
  sessionIngredients: z.array(z.string().min(1)).default([]),
  inventory: z.record(z.string().min(1), InventoryEntrySchema).default({}),
  budgetInr: z.number().nonnegative().nullable().optional(),
  itemPrices: z.record(z.string().min(1), ItemPriceSchema).optional(),
})

/**
 * Demand Multiplier = Weather x Event x Day-of-Week (x Festival x Match later).
 * All factors are multipliers around 1.0; `combined` is computed in code, never by the LLM.
 */
export const DemandMultiplierSchema = z.object({
  weather: z.number(),
  event: z.number(),
  weekday: z.number(),
  festival: z.number().default(1),
  match: z.number().default(1),
  combined: z.number(),
})

/** One curated/local event near Hazratganj. */
export const EventSignalSchema = z.object({
  name: z.string().min(1),
  date: z.string().min(1),
  distanceKm: z.number().nonnegative().optional(),
  expectedFootfall: z.enum(['low', 'medium', 'high']).optional(),
})

export const FestivalSignalSchema = z.object({
  name: z.string().min(1),
  impact: z.enum(['low', 'medium', 'high']),
})

export const MatchSignalSchema = z.object({
  teams: z.string().min(1),
  venue: z.string().min(1),
  startTime: z.string().min(1),
  expectedCrowd: z.enum(['low', 'medium', 'high']),
})

export const PriceSignalSchema = z.object({
  item: z.string().min(1),
  pricePerUnit: z.number().nonnegative(),
  unit: z.string().min(1),
  source: z.string().min(1),
  isMock: z.boolean().default(false),
})

/**
 * Everything the agent gathered about the world today.
 * `errors` records tool failures; a failed tool never crashes a run.
 */
export const SignalsSchema = z.object({
  weather: z
    .object({
      label: z.string().min(1),
      footfallImpact: z.number(),
      recommendation: z.string().default(''),
      temperature: z.number().optional(),
    })
    .nullable()
    .optional(),
  events: z.array(EventSignalSchema).default([]),
  festivals: z.array(FestivalSignalSchema).default([]),
  match: MatchSignalSchema.nullable().optional(),
  prices: z.array(PriceSignalSchema).default([]),
  social: z.array(z.string().min(1)).default([]),
  errors: z.array(z.string().min(1)).default([]),
})

/** End-of-day report from the vendor (feedback loop input; T2.x). */
export const DailyOutcomeSchema = z.object({
  item: z.string().min(1),
  outcome: z.enum([
    'sold_out',
    'just_right',
    'leftover_small',
    'leftover_medium',
    'leftover_large',
    'wasted',
  ]),
  leftoverLevel: z.enum(['small', 'medium', 'large']).nullable().optional(),
  quantitySold: z.number().nonnegative().optional(),
})

export const DailyLogSchema = z.object({
  vendorId: z.string().min(1),
  date: z.string().min(1), // ISO date (YYYY-MM-DD), Asia/Kolkata
  items: z.array(DailyOutcomeSchema).default([]),
  customers: z.number().nonnegative().optional(),
  createdAt: z.string().optional(),
})

/** Vendor profile persisted server-side (T2.2): vendors/{uid}.profile. */
export const VendorProfileSchema = z.object({
  stallType: z.string().min(1),
  stallLabel: z.string().min(1),
  stallEmoji: z.string().min(1),
  ingredients: z.array(z.string().min(1)).default([]),
  dailyBudgetInr: z.coerce.number().nonnegative().nullable().optional(),
  itemPrices: z.record(z.string().min(1), ItemPriceSchema).optional(),
})

/** Validator node output (the code-based critic). */
export const ValidationResultSchema = z.object({
  valid: z.boolean(),
  errors: z.array(z.string().min(1)).default([]),
})

/**
 * Explanation node output (T1.7): bilingual narrative around the validated
 * plan. Transform-free so it can be used with structured output mode.
 */
export const ExplanationSchema = z.object({
  summary: z.string().min(1),
  hindiSummary: z.string().min(1),
  peakHours: z.string().min(1),
  specialAdvice: z.string().min(1), // "English tip || Hindi tip"
  confidenceReason: z.string().min(1),
})

/**
 * Deterministic per-item plan computed in code (graph/nodes/forecast.js).
 * Pure numbers - the LLM reviews this draft but never recomputes it.
 */
export const DraftPlanItemSchema = z.object({
  item: z.string().min(1),
  unit: z.string().min(1),
  baseline: z.number().nonnegative(),
  bias: z.number().positive().default(1),
  totalNeeded: z.number().nonnegative(),
  alreadyHave: z.number().nonnegative(),
  toBuy: z.number().nonnegative(),
  buyPrice: z.number().nonnegative().nullable().optional(),
  sellPrice: z.number().nonnegative().nullable().optional(),
  unitMargin: z.number().nullable().optional(),
  estimatedCost: z.number().nonnegative().optional(),
  estimatedRevenue: z.number().nonnegative().optional(),
  estimatedProfit: z.number().optional(),
  budgetAdjusted: z.boolean().optional(),
  priceIsMock: z.boolean().optional(),
})

export const DraftPlanSchema = z.object({
  items: z.array(DraftPlanItemSchema).default([]),
  sufficientStockItems: z.array(z.string().min(1)).default([]),
  expectedCustomers: z.number().nonnegative().optional(),
  combinedMultiplier: z.number().optional(),
  /** Component factors that produced combinedMultiplier. */
  factors: z.record(z.string().min(1), z.number()).optional(),
  budgetInr: z.number().nonnegative().nullable().optional(),
  totalEstimatedCost: z.number().nonnegative().optional(),
  totalEstimatedRevenue: z.number().nonnegative().optional(),
  totalEstimatedProfit: z.number().optional(),
  budgetConstrained: z.boolean().optional(),
  pricingIsMock: z.boolean().optional(),
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
  dateLabel: z.string().min(1).optional(),
  dayName: z.string().min(1).optional(),
  // T1.3: the backend gathers weather/events/prices itself with tools.
  // Frontend-computed signals are kept as an optional fallback when a tool fails.
  weather: z.object(weatherShape).optional(),
  weatherSignal: z.object(weatherSignalShape).optional(),
  eventSummary: z.string().default('No special events reported today.'),
  weeklyMultiplier: z.coerce.number().optional(),
  eventMultiplier: z.coerce.number().optional(),
  demandMultiplier: z.coerce.number().optional(),
  budgetInr: z.coerce.number().nonnegative().nullable().optional(),
  itemPrices: z.record(z.string().min(1), ItemPriceSchema).optional(),
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
  // nullish: models often emit "note": null, and LangChain's structured-output
  // parser validates against this schema before normalizeLlmForecast can clean it.
  note: z.string().nullish(),
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

/** Code-computed financial summary attached after LLM structured output (T3.2). */
export const PlanFinancialsSchema = z.object({
  totalCostInr: z.number().nonnegative(),
  expectedRevenueInr: z.number().nonnegative(),
  expectedProfitInr: z.number(),
  marginPercent: z.number(),
  budgetInr: z.number().nonnegative().nullable(),
  withinBudget: z.boolean(),
  budgetConstrained: z.boolean().default(false),
  isMockPricing: z.boolean().default(false),
  items: z
    .record(
      z.string().min(1),
      z.object({
        buyPrice: z.number().nonnegative().nullable(),
        sellPrice: z.number().nonnegative().nullable(),
        costInr: z.number().nonnegative(),
        revenueInr: z.number().nonnegative(),
        profitInr: z.number(),
        isMock: z.boolean(),
      }),
    )
    .default({}),
})

export const EnrichedForecastResultSchema = ForecastResultSchema.extend({
  financials: PlanFinancialsSchema.optional(),
})

/**
 * Normalizes common LLM output quirks before strict validation:
 * "12" -> 12 for expectedCustomers, "high" -> "High", "ESSENTIAL" -> "essential",
 * "note": null -> key removed, missing sufficientStockItems -> [].
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
      const clean = { ...item }
      // Some models emit "note": null; optional string rejects null.
      if (clean.note === null || clean.note === undefined) {
        delete clean.note
      }
      return {
        ...clean,
        priority:
          typeof clean.priority === 'string'
            ? clean.priority.toLowerCase().trim()
            : clean.priority,
      }
    })
  }

  if (!Array.isArray(normalized.sufficientStockItems)) {
    normalized.sufficientStockItems = []
  }

  return normalized
}
