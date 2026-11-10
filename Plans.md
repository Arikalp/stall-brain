# Bazaar Brain: Upgrade Roadmap (for coding agents)

> Read this whole file before writing code. Work **one task at a time, in the order given**. After each task, run the acceptance checks , do not commit by yourself.

---

## 0. Context

**Product:** Bazaar Brain is a daily procurement advisor for street vendors in Hazratganj, Lucknow. A vendor picks a stall type, edits their ingredient list, enters current inventory, and gets a "buy today" list in English and Hindi.

**Current state (what exists):**
- React 19 + Vite SPA, Tailwind v4, React Router v6, Firebase Auth, deployed on Vercel.
- Pages: `LandingPage`, `ProfilePage`, `ForecastPage`.
- Utils: `groqAgent.js` (one LLM call to Groq `llama-3.3-70b-versatile`), `weatherLogic.js` (Open-Meteo + multiplier), `selectionStorage.js` (localStorage).
- Data: `stalls.js` (7 stall types), `events.js` (hardcoded Lucknow events).
- Demand model: `Demand Multiplier = Weather Impact x Event Impact x Day-of-Week Pattern`.
- Forecast history and feedback live in localStorage and are **never used** by the forecast.

**Core problems to fix:**
1. It is a **pipeline, not an agent**: fixed steps, one LLM call, no tool choice, no self-checking, no loop.
2. `VITE_GROQ_API_KEY` is **exposed in the browser bundle**. Anyone can steal it.
3. The LLM does arithmetic that code should do.
4. The feedback loop is stored but unused, so the system never learns.
5. Signals are thin: hardcoded events, no festivals, no match schedule, no prices.
6. No way to measure forecast quality.

---

## 1. Decisions 

| Decision | Default | Notes |
|---|---|---|
| Backend runtime | **Node.js 20+ with Express** (ES modules) | Plain JavaScript to match the frontend. TypeScript is optional; if used, do it for the whole backend from the start. |
| Agent framework | **LangGraph.js** (`@langchain/langgraph`) | Use `StateGraph` with `Annotation.Root`, `addConditionalEdges`, `interrupt` + `Command({ resume })`, and a checkpointer. |
| LLM client | `@langchain/groq` (`ChatGroq`), model `llama-3.3-70b-versatile` | Keep it behind a thin `llm.js` wrapper so the model can be swapped. |
| Schema validation | **Zod** | One schema per contract. Use `llm.withStructuredOutput(zodSchema)` for LLM output and validate again before use. |
| Tool definitions | `tool()` from `@langchain/core/tools` with Zod input schemas | Bind to the model with `bindTools`. |
| Backend hosting | Render / Railway / Fly.io | Needs a persistent process for SSE streaming and checkpointing. Vercel stays for the frontend. (Express on Vercel serverless is possible but poorly suited to streaming and long-lived runs.) |
| Database | **Firestore** (already have Firebase) | Vendor profiles, daily logs, learned bias factors. Accessed through `firebase-admin`. |
| Auth | Firebase Auth on the frontend; Express middleware **verifies the Firebase ID token** on every request | Use `firebase-admin`'s `verifyIdToken`. |
| Checkpointer | `MemorySaver` in dev; a persistent one in prod (`@langchain/langgraph-checkpoint-postgres` or sqlite, or a custom Firestore-backed saver) | Decide at T1.9. |
| Tracing | LangSmith (set `LANGSMITH_TRACING`, `LANGSMITH_API_KEY`, `LANGSMITH_PROJECT`) or Langfuse | Free tier is enough. |
| Testing | **Vitest** | Plus `supertest` for route tests. |
| Scheduling | `node-cron` (or the host's cron service) | For the WhatsApp morning job. |
| Hardening | `helmet`, `cors` (allow only the frontend origin), `express-rate-limit` | |

**Repo layout to introduce:**

```
/                      # existing frontend (unchanged location)
backend/
  package.json         # "type": "module"
  .env.example
  src/
    index.js           # Express app bootstrap, CORS, helmet, routes
    config.js          # env parsing (zod-validated)
    middleware/
      auth.js          # Firebase ID token verification
      rateLimit.js
    routes/
      forecast.js      # POST /api/forecast, GET /api/forecast/stream, POST /api/forecast/resume
      logs.js          # POST /api/logs (end-of-day)
      whatsapp.js      # webhook for replies (T3.6)
    llm.js             # ChatGroq wrapper
    schemas.js         # Zod schemas (contracts)
    graph/
      state.js         # Annotation.Root state
      build.js         # graph assembly + checkpointer
      nodes/
        loadContext.js
        gatherSignals.js
        forecast.js
        plan.js
        validate.js
        explain.js
        humanApproval.js
        save.js
    tools/
      weather.js
      events.js
      festivals.js
      cricket.js
      prices.js
      webSearch.js
    learning/
      bias.js          # bias correction from logs
    store/
      firestore.js
  tests/
  evals/
    backtest.js
    cases/
```

---

## 2. Target architecture

```
React SPA  --(Firebase ID token)-->  Express  -->  LangGraph.js agent  -->  Groq
                                        |               |
                                        |               +--> tools (weather, events, festivals, cricket, prices, search)
                                        +--> Firestore (profiles, logs, bias factors) + checkpointer
```

### Agent graph

```
START
  -> loadContext           # profile, inventory, last N days of logs, learned bias
  -> gatherSignals         # tool-using node (weather, events, festivals, cricket, prices, search)
  -> forecastDemand        # deterministic math in code: multipliers x baseline x bias
  -> planProcurement       # LLM, structured output, reasons about edge cases
  -> validate              # code-based critic
        |-- invalid --> planProcurement   (max 3 retries, errors passed back in state)
        |-- valid   --> explain
  -> explain               # EN + HI summary, advice
  -> humanApproval         # interrupt(): vendor edits/approves quantities
  -> save                  # persist run
  -> END
```

### Graph state (`graph/state.js`)

```js
import { Annotation } from "@langchain/langgraph";

export const AgentState = Annotation.Root({
  vendorId: Annotation(),
  runId: Annotation(),
  date: Annotation(),                 // ISO date, Asia/Kolkata
  profile: Annotation(),              // UserProfile
  sessionIngredients: Annotation(),   // string[]
  inventory: Annotation(),            // { [item]: { quantity, unit } }
  budgetInr: Annotation(),            // number | null
  history: Annotation(),              // last 14-30 DailyLog entries
  bias: Annotation(),                 // { [item]: number } per-item correction factors
  signals: Annotation(),              // weather, events, festivals, match, prices, social, errors
  multiplier: Annotation(),           // { weather, event, weekday, combined }
  baseline: Annotation(),             // { [item]: number }
  draftPlan: Annotation(),            // deterministic numeric plan
  plan: Annotation(),                 // ForecastResult | null (LLM-reviewed)
  validationErrors: Annotation(),     // string[]
  retryCount: Annotation(),           // number
  approvedPlan: Annotation(),         // ForecastResult | null
  trace: Annotation({                 // human-readable steps, streamed to UI
    reducer: (a, b) => a.concat(b),
    default: () => [],
  }),
});
```

Zod schemas for every contract (`UserProfile`, `InventoryEntry`, `Signals`, `DemandMultiplier`, `ProcurementItem`, `ForecastResult`, `DailyLog`) live in `schemas.js`, and the state shape above must stay consistent with them.

---

## 3. Task list

Each task has: **Goal**, **Why**, **Files**, **Steps**, **Acceptance criteria**.

---

### PHASE 0: Security and hygiene (do first)

#### T0.1: Remove the API key from the browser
- **Goal:** No secret ships in the client bundle.
- **Why:** `VITE_*` variables are public. The Groq key can be extracted from DevTools.
- **Files:** `src/utils/groqAgent.js` (delete or reduce to an API call), `.env`, `backend/src/index.js`, `backend/src/llm.js`.
- **Steps:**
  1. Create the `backend/` Express app with `GET /health`, `helmet`, and `cors` restricted to the frontend origin.
  2. Move Groq calls into `backend/src/llm.js`, reading `GROQ_API_KEY` from server env.
  3. Replace `groqAgent.js` with a `fetch` to `POST /api/forecast`.
  4. Remove `VITE_GROQ_API_KEY` from the repo and `.env.example`; **rotate the existing key**.
- **Acceptance:** `grep -r "GROQ" dist/` after `npm run build` returns nothing. Forecast still works end to end.

#### T0.2: Authenticate backend requests
- **Goal:** Only logged-in vendors can call the API.
- **Files:** `backend/src/middleware/auth.js`, `backend/src/index.js`, frontend API helper.
- **Steps:** Frontend sends `Authorization: Bearer <firebase_id_token>` (from `user.getIdToken()`). The middleware verifies it with `firebase-admin` and sets `req.vendorId` to the uid. Add `express-rate-limit` per vendor.
- **Acceptance:** Request without a valid token gets 401. A valid token reaches the handler with `req.vendorId` set.


### PHASE 1: Real agent with LangGraph.js

#### T1.1: Zod schemas
- **Goal:** One source of truth for all data contracts.
- **Files:** `backend/src/schemas.js`.
- **Steps:** Port the existing contracts (`UserProfile`, `ForecastSession`, `DemandMultiplier`, `ProcurementItem`, `ForecastResult`) to Zod. Add `InventoryEntry`, `Signals`, `DailyLog`, `ValidationResult`. Constrain `priority` to `z.enum(["high","medium","low"])` and `confidenceLevel` likewise. Validate request bodies at the route boundary.
- **Acceptance:** The frontend's existing response shape still validates. Invalid LLM output throws a validation error.

#### T1.2: Graph skeleton
- **Goal:** Runnable graph with stub nodes.
- **Files:** `graph/state.js`, `graph/build.js`, `graph/nodes/*`, `routes/forecast.js`.
- **Steps:** Build the `StateGraph(AgentState)` from section 2, with each node an async function returning a partial state update. Wire the conditional edge from `validate` using `addConditionalEdges`. Compile with a checkpointer. Expose `POST /api/forecast` that invokes the graph with `{ configurable: { thread_id: runId } }`.
- **Acceptance:** Calling the endpoint runs all nodes in order and returns a (stubbed) result. The graph diagram is generated with `graph.getGraph().drawMermaid()` and committed to the README.

#### T1.3: Signal tools
- **Goal:** Replace hardcoded signals with real tools the agent can call.
- **Files:** `backend/src/tools/*.js`, `graph/nodes/gatherSignals.js`.
- **Tools to implement (each defined with `tool()` and a Zod input schema, returns typed output, handles failure gracefully):**
  | Tool | Source | Returns |
  |---|---|---|
  | `getWeather` | Open-Meteo (Hazratganj lat/lon, hourly + daily) | temp, rain probability by hour, conditions |
  | `getLocalEvents` | Curated `events` data + web search fallback | events today and next 3 days near Hazratganj |
  | `getFestivals` | Festival calendar (Hindu and Islamic holidays, local melas, wedding season) | festival name, expected footfall effect |
  | `getCricketSchedule` | Ekana Stadium fixtures (IPL/domestic/international) | match date/time, expected crowd |
  | `getMandiPrices` | Agmarknet / data.gov.in if available; otherwise a mock fixture clearly labeled | prices for key ingredients |
  | `webSearch` | Tavily or similar (`@langchain/tavily`) | recent local news/social buzz |
- **Agentic behavior:** `gatherSignals` lets the LLM choose which tools to call based on the stall type (e.g. flowers: check festivals and weddings first; chai: weather first). Use `llm.bindTools(tools)` in a bounded loop (max 6 tool calls), or `createReactAgent` from `@langchain/langgraph/prebuilt` as a subgraph with a recursion limit. Run independent calls in parallel with `Promise.allSettled`.
- **Failure rule:** If a tool fails, record it in `signals.errors` and continue. Never crash the run.
- **Acceptance:** Run for two stall types and confirm `trace` shows different tool choices. A failing network for one tool still yields a forecast with a lower confidence level.

#### T1.4: Deterministic forecast node
- **Goal:** All arithmetic happens in code, not in the LLM.
- **Files:** `graph/nodes/forecast.js`, baseline data files.
- **Steps:**
  1. Define per-stall, per-item baseline demand (units/day) and weekday pattern in a data file.
  2. Compute `combined = weather x event x weekday x festival x match`, clamped to a sane range (e.g. 0.4 to 2.5).
  3. `totalNeeded = baseline x combined x bias[item]`.
  4. `toBuy = Math.max(0, totalNeeded - alreadyHave)`.
  5. Store the numeric draft in `state.draftPlan` for the LLM to review.
- **Acceptance:** Vitest unit tests cover rainy day, match day, festival day, and zero inventory. Same inputs always give the same numbers.

#### T1.5: Planner node (LLM, structured output)
- **Goal:** The LLM reasons about edge cases on top of the numeric draft, and does **not** recompute totals from scratch.
- **Files:** `graph/nodes/plan.js`, `llm.js`.
- **Steps:** Pass the draft plan, signals, and history to the LLM. It may adjust quantities within bounds (e.g. +/-25%) and must attach a `note` for each adjustment. Use `llm.withStructuredOutput(ForecastResultSchema)` and re-validate with Zod. On retry, include `validationErrors` in the prompt.
- **Acceptance:** Output always validates. Adjustments outside bounds are rejected by the validator.

#### T1.6: Validator node (the self-correction loop)
- **Goal:** A code-based critic that catches bad plans and sends them back.
- **Files:** `graph/nodes/validate.js`.
- **Checks:**
  - `toBuy === Math.max(0, totalNeeded - alreadyHave)` for every item (tolerance for rounding).
  - No negative quantities; units match the profile.
  - Every item in `sessionIngredients` appears exactly once (either in `procurementList` or `sufficientStockItems`).
  - Total cost is within `budgetInr` when a budget is set.
  - Perishables do not exceed a shelf-life-based cap.
  - Adjustments stay within the allowed band vs the deterministic draft.
- **Routing:** The conditional edge function returns `"planProcurement"` if errors exist and `retryCount < 3`, otherwise `"explain"`. After 3 failures, fall back to the deterministic draft with `confidenceLevel = "low"` and a note.
- **Acceptance:** Inject a deliberately wrong plan in a test and confirm the loop corrects it. The trace shows the retry.

#### T1.7: Explain node (bilingual)
- **Goal:** Clear EN and HI summaries and advice, generated after validation.
- **Files:** `graph/nodes/explain.js`.
- **Steps:** Generate `summary`, `hindiSummary`, `peakHours`, `specialAdvice`, `confidenceReason` from the validated plan and signals. Hindi must be simple, spoken-style Hindi (not formal or Sanskritized).
- **Acceptance:** Output includes both languages. Numbers in the text match the plan.

#### T1.8: Human-in-the-loop approval
- **Goal:** The vendor can tweak the plan before it is saved.
- **Files:** `graph/nodes/humanApproval.js`, `routes/forecast.js` (`POST /api/forecast/resume`), `ForecastOutput.jsx`, new `PlanEditor` component.
- **Steps:** Call `interrupt({ plan })` from `@langchain/langgraph` after `explain`. The frontend shows the plan with editable quantities and an Approve button, then calls the resume endpoint, which invokes the graph with `new Command({ resume: editedPlan })` on the same `thread_id`. Record the edits (they are learning signal for T2.3). Note: LangGraph re-runs the interrupted node from its start on resume, so keep everything before `interrupt()` in that node side-effect free.
- **Acceptance:** Edited quantities are what get saved. A rejected plan can be regenerated.

#### T1.9: Checkpointing and memory
- **Goal:** Runs are resumable and the agent remembers the vendor.
- **Steps:** Use `MemorySaver` in dev and a persistent checkpointer in prod (Postgres or SQLite saver package, or a custom Firestore-backed `BaseCheckpointSaver`). Key runs by `runId` as `thread_id`. `loadContext` pulls the last 14-30 `DailyLog` entries and bias factors for the vendor from Firestore.
- **Acceptance:** Restarting the server mid-interrupt does not lose a pending approval (in the persistent setup).

#### T1.10: Stream agent progress to the UI
- **Goal:** Replace the generic loading spinner with live agent steps.
- **Files:** `routes/forecast.js` (SSE endpoint), `LoadingState.jsx`.
- **Steps:** Use `graph.stream(input, { streamMode: ["updates", "custom"], configurable })` and forward events over Server-Sent Events (`text/event-stream`). Emit readable steps: "Checking weather...", "Found: LSG match at 7 PM", "Validating plan...", "Retrying: budget exceeded". Consume them on the frontend with `fetch` + `ReadableStream` (EventSource cannot send auth headers).
- **Acceptance:** The UI shows steps as they happen. This is the demo moment that proves it is agentic.

---

### PHASE 2: Close the feedback loop (biggest usefulness win)

#### T2.1: End-of-day sales log UI
- **Goal:** Vendor reports what actually happened in two taps per item.
- **Files:** new `EndOfDayLog.jsx`, extend `HistoryLog.jsx`, `backend/src/routes/logs.js`.
- **Steps:** For each item in today's plan: `Sold out early | Just right | Leftover (small/medium/large) | Wasted`. Optional: rough customer count. Large tap targets, Hindi labels, works on a phone.
- **Acceptance:** Logging a full day takes under 30 seconds for 8 items.

#### T2.2: Firestore data model
- **Goal:** Persist profile, runs, and logs server-side (replace localStorage for forecast history).
- **Schema:**
  ```
  vendors/{vendorId}
    profile: {...}
    biasFactors: { item: { weekday: factor, ... } }
    runs/{runId}: { date, signals, plan, approvedPlan, createdAt }
    logs/{date}: { items: { item: { outcome, leftoverLevel } }, customers? }
  ```
- **Acceptance:** Data survives clearing the browser. Firestore security rules restrict access to the owning uid.

#### T2.3: Bias correction
- **Goal:** Forecasts improve per vendor over time.
- **Files:** `backend/src/learning/bias.js`, `loadContext.js`, `forecast.js`.
- **Steps:**
  1. Convert outcomes to a signed error per item (sold out = under-bought, large leftover or wasted = over-bought).
  2. Update a per-item (and per weekday/weather-bucket) factor with an exponential moving average, clamped to e.g. 0.6-1.6.
  3. Treat manual vendor edits in T1.8 as extra signal.
  4. Feed `bias[item]` into the forecast node.
  5. Explain it to the user: "You usually over-buy bhutta on weekdays, so I reduced it 15%."
- **Acceptance:** On synthetic logs showing consistent over-buying, bias factors trend below 1.0 and recommendations drop accordingly.

---

### PHASE 3: Features vendors will actually use

#### T3.1: Hindi voice input and output
- Web Speech API with `hi-IN` for inventory input ("das kilo aloo hai") and speech synthesis for the Hindi summary. Parse spoken input into `{item, quantity, unit}` with a small structured-output LLM call and show it for confirmation. **Acceptance:** A vendor can fill inventory by voice, and have the forecast read aloud.

#### T3.2: Costs, budget and profit optimization
- Add buy price, sell price, and a daily budget cap to the profile and session. Extend the planner objective from "right quantity" to "maximize expected profit under budget". Show expected revenue, cost, and margin (this absorbs the README's "Revenue estimator"). **Acceptance:** With a tight budget, the agent prioritizes high-margin and high-demand items and the validator enforces the cap.

#### T3.3: Shelf life and spoilage awareness
- Add `shelfLifeDays` and `perishable` to ingredient data. The planner and validator account for carry-over. If tomorrow's signals are bad, buy less of items that would spoil. **Acceptance:** Perishables are capped appropriately and notes explain why.

#### T3.4: Multi-day lookahead
- Fetch a 3-day signal window. The agent plans today knowing tomorrow (e.g. "Saturday has a match, so keep non-perishable stock"). **Acceptance:** Output includes a short "tomorrow outlook" and today's plan changes when tomorrow's signals change.

#### T3.5: What-if mode
- UI controls such as "What if it rains at 5 PM?" or "What if there is a big event?". Re-run the graph with overridden signals under a separate `thread_id`, clearly labeled as a simulation and not saved as a real run. **Acceptance:** Side-by-side comparison of baseline vs what-if plan.

#### T3.6: WhatsApp morning delivery
- A `node-cron` job (or the host's scheduler) generates each opted-in vendor's forecast at ~6 AM IST and sends a compact Hindi message via the WhatsApp Cloud API or Twilio. Include a reply flow through `routes/whatsapp.js`: "Reply 1 to approve, or send changes." **Acceptance:** An opted-in test number receives the message at the scheduled time. Opt-out works.

#### T3.7: PWA and offline support
- Installable PWA (e.g. `vite-plugin-pwa`), cached last forecast, offline-friendly end-of-day log that syncs when back online. **Acceptance:** Lighthouse PWA checks pass; logging works in airplane mode.

#### T3.8: Crowd and social signals
- Parse public signals like `#Hazratganj` and `#LucknowFoodies` via the search tool for viral spikes (use only public, ToS-compliant sources). **Acceptance:** A detected spike appears in `signals` with a source and raises the event factor modestly.

#### T3.9: Group buying (stretch)
- Aggregate anonymized demand across nearby vendors in the same lane to suggest shared wholesale orders. **Acceptance:** Show a "X vendors nearby need potatoes today" suggestion with an opt-in flow.

---

### PHASE 4: Quality, evaluation, observability

#### T4.1: Backtest and eval harness
- **Files:** `backend/evals/backtest.js`, `backend/evals/cases/*.json`, `npm run eval` script.
- Build 20+ cases (synthetic at first, real logs later) with known signals and outcomes. Metrics: MAPE of `totalNeeded`, stock-out rate, waste rate, validator pass rate, retry count. Compare: **old single-prompt pipeline vs new agent**. Output a table for the demo. **Acceptance:** `npm run eval` prints a metrics table and exits non-zero if the agent regresses against thresholds.

#### T4.2: Tracing
- Enable LangSmith (env vars) or Langfuse. Tag runs with hashed `vendorId`, stall type, and retry count. **Acceptance:** Every run is viewable as a trace with node timings.

#### T4.3: Reliability
- Cache weather/events/festivals (TTL 30-60 min, e.g. `lru-cache`). Rate-limit `/api/forecast` per vendor. Timeouts (`AbortSignal.timeout`) and retries on tools and LLM calls. A deterministic fallback when the LLM is down. **Acceptance:** Making Groq unreachable still returns a low-confidence deterministic forecast.

#### T4.4: Tests
- Vitest unit tests for multiplier math, validator rules, bias updates, and tool parsers. Integration test for the full graph with mocked tools and a fake LLM, plus `supertest` tests for auth and routes. **Acceptance:** `npm test` is green in CI (GitHub Actions).

---

## 4. Definition of done (whole project)

- [ ] No secrets in the client bundle; all API calls authenticated.
- [ ] Graph demonstrates tool choice, a validator retry loop, and human approval, visible in streamed UI steps and LangSmith traces.
- [ ] Forecast arithmetic is deterministic and tested; the LLM output is Zod-validated.
- [ ] End-of-day logs feed bias correction, and the UI explains adjustments.
- [ ] Backtest shows the agent beating the old pipeline on at least one metric.
- [ ] README is accurate, with architecture diagram and setup steps for both frontend and backend.

## 5. Recommended order of work

1. T0.1, T0.2, T0.3
2. T1.1, T1.2, T1.4, T1.6 (a working skeleton with the loop, even with stub tools)
3. T1.3, T1.5, T1.7, T1.10
4. T1.8, T1.9
5. T2.1, T2.2, T2.3
6. T4.1, T4.2 (so the demo has numbers and traces)
7. T3.x features, by impact: T3.2, T3.1, T3.3, T3.6, T3.4, T3.5, T3.7, T3.8, T3.9
8. T4.3, T4.4 (can run in parallel throughout)

## 6. Rules for the coding agent

- Keep the existing UI and Tailwind styling conventions; do not redesign unrelated pages.
- Never put secrets in frontend code or commit `.env` files. Provide `.env.example`.
- Every LLM output must be validated against a Zod schema before use.
- Never let the LLM do arithmetic that code can do.
- Tool failures must degrade gracefully, never crash a run.
- Graph nodes return partial state updates and stay free of side effects before an `interrupt()` call.
- Use ES modules and `async/await` throughout the backend; no callback-style code.
- Prefer small, reviewable commits, one task per commit, with tests for new logic.
- If a task is ambiguous, state the assumption in the commit message instead of guessing silently.
- Mock data must be clearly labeled as mock in code and in the UI.