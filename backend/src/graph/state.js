import { Annotation } from '@langchain/langgraph'

/**
 * Agent state for the Bazaar Brain forecast graph.
 * Every node returns a partial state update; `trace` accumulates human-readable
 * steps that get streamed to the UI (T1.10).
 */
export const AgentState = Annotation.Root({
  /** Firebase uid of the vendor making the request. */
  vendorId: Annotation(),
  /** Unique id for this run; also used as the checkpointer thread_id. */
  runId: Annotation(),
  /** ISO date (YYYY-MM-DD) in Asia/Kolkata. */
  date: Annotation(),
  /** UserProfile (see schemas.js). */
  profile: Annotation(),
  /** string[] of items the vendor sells in this session. */
  sessionIngredients: Annotation(),
  /** { [item]: { quantity, unit } } */
  inventory: Annotation(),
  /** Daily budget in INR, or null when unset. */
  budgetInr: Annotation(),
  /** { [item]: { buyPrice?, sellPrice? } } per-item vendor pricing overrides (T3.2). */
  itemPrices: Annotation(),
  /** What-if simulation mode flag (T3.5): runs on separate thread_id, never saved to Firestore. */
  simulation: Annotation(),
  /** Overridden signals supplied by What-If UI (T3.5). */
  signalOverrides: Annotation(),
  /** Vendor market lane for local & group-buying context (T3.9). */
  lane: Annotation(),
  /** Whether vendor opted into group-buying aggregation (T3.9). */
  groupBuyingOptIn: Annotation(),

  /** The original validated request payload (bridge until the frontend sends the new shape). */
  request: Annotation(),

  /** Last 14-30 DailyLog entries (Firestore; stubbed until T2.2). */
  history: Annotation(),
  /** { [item]: number } per-item correction factors learned from logs. */
  bias: Annotation(),

  /** Weather, events, festivals, match, prices, social buzz, tool errors. */
  signals: Annotation(),
  /** { weather, event, weekday, festival, match, combined } - computed in code. */
  multiplier: Annotation(),
  /** { [item]: number } baseline daily demand in units. */
  baseline: Annotation(),

  /** Deterministic numeric plan (DraftPlanSchema) - never computed by the LLM. */
  draftPlan: Annotation(),
  /** ForecastResult | null - the LLM-reviewed plan. */
  plan: Annotation(),
  /** string[] - errors found by the validator node. */
  validationErrors: Annotation(),
  /** Retries of planProcurement so far (max 3). */
  retryCount: Annotation(),
  /** ForecastResult | null - after the vendor approves/edits (T1.8). */
  approvedPlan: Annotation(),
  /** [{ item, field, from, to }] - what the vendor edited (learning signal for T2.3). */
  approvedEdits: Annotation(),
  /** How many times the vendor rejected a plan (max 3 regenerations). */
  approvalRejections: Annotation({
    reducer: (a, b) => a + b,
    default: () => 0,
  }),

  /** Human-readable steps, streamed to the UI. */
  trace: Annotation({
    reducer: (a, b) => a.concat(b),
    default: () => [],
  }),

  /** Per-node wall-clock timings in ms (T4.2). */
  nodeTimings: Annotation({
    reducer: (a, b) => a.concat(b),
    default: () => [],
  }),
})
