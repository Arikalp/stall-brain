<div align="center">

<img src="https://img.shields.io/badge/%20%C2%B7%20Hyperlocal%20Demand%20Forecasting-F59E0B?style=for-the-badge" />
&nbsp;
&nbsp;
<img src="https://img.shields.io/badge/Live-stall--brain.vercel.app-4ADE80?style=for-the-badge&logo=vercel&logoColor=white" href="https://stall-brain.vercel.app" />

<br /><br />

# 🧠 Bazaar Brain

### *रोज़ का हिसाब, AI का जवाब*
*Daily stock decisions, answered by AI*

**An agentic AI demand forecasting tool for street vendors in Hazratganj, Lucknow —**  
combining live weather, local events, festivals, cricket fixtures, and custom inventory to deliver daily procurement recommendations.

[**View Live Demo →**](https://stall-brain.vercel.app)

</div>

---

## 👥 Team Code Oxide

| Name | GitHub |
|------|--------|
| Tushar Bajpai | [@Tushar](https://github.com/Tushar-Bajpai) |
| Sankalp Saini | [@Sankalp](https://github.com/Arikalp) |
| Subrat Dwivedi | [@Subrat](https://github.com/subrat-dwi) |
| Utsav Singh | [@Utsav](https://github.com/githubutsav) |

**Repository:** [github.com/subrat-dwi/stall-brain](https://github.com/subrat-dwi/stall-brain)

---

## 🎯 Problem Statement

> *"Hazratganj's iconic street market has vendors who over-stock or under-stock daily, leading to waste and lost revenue. Build an agent that reads footfall patterns, weather, local events, and social buzz to recommend optimal daily procurement."*
>
> **Lucknow context:** Hazratganj · Janpath Market

Every morning, thousands of street vendors in Hazratganj make the same high-stakes guess: **how much stock should I buy today?**

They have no tools. They rely on gut feel, last week's memory, and WhatsApp forwards. The consequences are real:

- A vendor overbought potatoes on a rainy day — the crowd never came, the stock rotted.
- The next day, fearing rain again, he bought less — but it was an LSG match day, the streets were packed, and he sold out by 4 PM, losing thousands in revenue.

This isn't bad luck. It's a **data problem**. The signals exist — weather forecasts, event calendars, day-of-week patterns — but no one has put them together for a Hazratganj vendor. Bazaar Brain does exactly that.

---

## 💡 Solution

Bazaar Brain is a **multi-page agentic web app** split into dedicated `frontend/` and `backend/` applications. A vendor picks their stall type, customizes their item list and current inventory, and a stateful **LangGraph.js** agent on the backend gathers live weather, local events, festival calendars, Ekana cricket fixtures, mandi prices, and web search buzz to produce a validated, bilingual (English + Hindi) daily procurement plan — and learns over time from end-of-day sales logs.

---

## ✨ Features

**Vendor Auth & Persistent Profiles**  
Users sign up and log in via Firebase Auth. Profiles and forecast run histories persist in Firestore (`GET/PUT /api/profile`, `GET /api/runs`) with Firebase ID token verification on every backend route.

**Stall Type Selection (7 types)**  
Seven vendor archetypes tailored to Hazratganj: Chaat, Chai, Juice, Flowers, Bhutta, Snacks & Namkeen, Balloon & Toy.

**Editable Ingredient Lists & Current Inventory**  
Profile ingredients are editable, and each forecast session lets vendors adjust items for the day and enter current stock on hand (quantity + unit) so the agent recommends only what still needs to be bought.

**Agentic Signal Gathering**  
`gatherSignals` uses `llm.bindTools()` in a bounded tool-calling loop to pick relevant tools per stall type: Open-Meteo weather, curated Hazratganj events & Hindu/Islamic festival calendar, Ekana Stadium cricket fixtures, mandi prices (Agmarknet / mock fallback), and Tavily web search. Tool failures degrade gracefully and lower confidence instead of crashing.

**Deterministic Demand Math**  
All demand arithmetic runs in code (`backend/src/graph/nodes/forecast.js`), never inside the LLM:

```
combined    = clamp(weather × event × weekday × festival × match, 0.4, 2.5)
totalNeeded = baseline × combined × bias[item]
toBuy       = max(0, totalNeeded − alreadyHave)
```

**Validator Self-Correction Loop**  
A code-based critic (`backend/src/graph/nodes/validate.js`) checks arithmetic consistency, ±25% adjustment bounds, unit matching, and item coverage, looping bad plans back to the planner up to 3 retries before falling back to the deterministic draft at `Low` confidence.

**Human-in-the-Loop Approval & Live SSE Streaming**  
Runs stream step-by-step progress over `POST /api/forecast/stream` (`fetch` + `ReadableStream`), then pause at `humanApproval` (`interrupt()`). Vendors can edit quantities and approve (or reject to regenerate) via `PlanEditor.jsx` and `POST /api/forecast/resume`.

**Bilingual Briefing (EN + HI)**  
Generates English and spoken-style Hindi summaries (`explain.js`) after validation, with a one-click toggle in `ForecastOutput.jsx`.

**End-of-Day Sales Log & Bias Correction (Phase 2)**  
`EndOfDayLog.jsx` lets vendors log per-item outcomes (`Sold out early`, `Just right`, `Leftover` small/medium/large, `Wasted`) in two taps per item (`POST /api/logs`), with offline queuing (`offlineStore.js`) when offline. `backend/src/learning/bias.js` updates per-item and per-weekday EMA factors in Firestore (`vendors/{uid}.biasFactors`) from both daily logs and approval edits, and explains adjustments back to the vendor.

**Phase 3 Capabilities (Voice, Economics, Spoilage, Lookahead, What-If, WhatsApp, Social, PWA & Group Buying)**  
- **Hindi Voice Input & Spoken Output**: `VoiceInventoryInput.jsx` uses Web Speech API (`hi-IN`) + `POST /api/voice/parse-inventory` to parse spoken inventory updates into confirmation chips; `ForecastOutput.jsx` speaks the Hindi briefing via `speechSynthesis`.
- **Profit & Daily Budget Optimization**: `backend/src/utils/economics.js` computes per-item cost, revenue, and margin using vendor buy/sell overrides or mock Lucknow mandi prices, maximizing profit inside `dailyBudgetInr` and validated by `validate.js`.
- **Shelf-Life & 3-Day Lookahead**: `baselines.js` tags perishables (`shelfLifeDays`, `perishable`) and `weather.js` / `events.js` / `cricket.js` provide a 3-day lookahead; `forecast.js` & `validate.js` cap short-life items before bad tomorrow weather and surface `Tomorrow's Outlook`.
- **What-If Simulation Mode**: `WhatIfPanel.jsx` lets vendors run rain/event/match/social scenarios on a separate `sim-*` thread (`simulation: true`, skipping `interrupt()` and Firestore writes) with side-by-side baseline comparison.
- **Crowd & Social Signals**: `getSocialBuzzTool` in `backend/src/tools/search.js` scans `#Hazratganj` / `#LucknowFoodies` news/social buzz and applies modest demand uplift or closure alerts.
- **WhatsApp Morning Delivery (`node-cron`)**: `backend/src/jobs/whatsappMorning.js` schedules 6:00 AM IST Hindi briefings for opted-in vendors (`WHATSAPP_TOKEN` / Twilio or dry-run preview) and `backend/src/routes/whatsapp.js` handles replies (`1`, edits, `STOP`).
- **PWA & Offline Mode**: `vite-plugin-pwa` (`src/sw.js`) caches app shell assets (`dist/manifest.webmanifest`, `dist/sw.js`), shows cached last forecasts offline, and queues/syncs offline EOD logs automatically.
- **Lane Group Buying**: `backend/src/routes/groupBuying.js` + `GroupBuyingCard.jsx` pool anonymized daily demand per Lucknow market lane (`"X vendors nearby need <item> today"`).

---

## 🗺️ App Flow

```
Landing / Home  →  Login / Signup  →  Profile Setup  →  Forecast Page  →  Agent Stream  →  PlanEditor (Approve/Edit)  →  ForecastOutput  →  EndOfDayLog
```

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19 + Vite 8 (`frontend/`) |
| Styling | Tailwind CSS v4 + CSS Variables |
| Routing | React Router v7 (`react-router-dom`) |
| Auth | Firebase Auth (client SDK + `firebase-admin` token verification) |
| Backend | Node.js 20+ + Express 5 (`backend/`, ES modules) |
| Agent Framework | LangGraph.js (`@langchain/langgraph`) — `StateGraph`, `interrupt`, `Command({ resume })` |
| LLM | Groq API — `openai/gpt-oss-120b` default via `@langchain/groq` (configurable via `GROQ_MODEL`) |
| Validation | Zod (request boundaries, schemas, and LLM structured outputs) |
| Security | `helmet`, origin-restricted `cors`, `express-rate-limit`, `firestore.rules` |
| Weather & Signals | Open-Meteo API, curated Lucknow festivals/events/cricket, Agmarknet/mock prices, optional Tavily search |
| Database & Checkpointing | Firestore (`vendors/{uid}`, `runs`, `logs`, `biasFactors`) + `MemorySaver` / `FirestoreCheckpointSaver` |
| Icons | Lucide React |
| Testing | Vitest + Supertest (`backend/tests/`) |

---

## 🏗️ Repository Layout

```
stall-brain/
├── frontend/                        # React 19 + Vite SPA
│   ├── public/                      # Static assets (favicon.svg, icons.svg)
│   ├── src/
│   │   ├── assets/                  # Images and SVGs (hero.png, react.svg, vite.svg)
│   │   ├── components/              # UI components:
│   │   │                            #   EndOfDayLog.jsx, PlanEditor.jsx, ForecastOutput.jsx,
│   │   │                            #   SignalPanel.jsx, LoadingState.jsx, FeedbackBar.jsx,
│   │   │                            #   HistoryLog.jsx, StallSelector.jsx, Header.jsx,
│   │   │                            #   Navbar.jsx, Hero.jsx, Features.jsx, HowItWorks.jsx,
│   │   │                            #   Demo.jsx, Problem.jsx, Stats.jsx, Pricing.jsx,
│   │   │                            #   Testimonials.jsx, FAQ.jsx, CTA.jsx, Footer.jsx
│   │   ├── data/                    # stalls.js, events.js
│   │   ├── pages/                   # LandingPage.jsx, HomePage.jsx, LoginPage.jsx,
│   │   │                            #   SignupPage.jsx, ProfilePage.jsx, ForecastPage.jsx, SetupPage.jsx
│   │   ├── utils/                   # api.js, groqAgent.js, logsApi.js, profileApi.js,
│   │   │                            #   firebase.js, forecastSessionStore.js, profileStorage.js,
│   │   │                            #   selectionStorage.js, weatherLogic.js, dateTime.js
│   │   ├── App.jsx
│   │   ├── App.css
│   │   ├── main.jsx
│   │   └── index.css
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   ├── eslint.config.js
│   └── .env.example                 # Public VITE_* Firebase config + VITE_API_URL
│
├── backend/                         # Express 5 + LangGraph.js API server
│   ├── src/
│   │   ├── index.js                 # Express app bootstrap (helmet, CORS, /health, /api routes)
│   │   ├── config.js                # Zod-validated environment configuration
│   │   ├── llm.js                   # ChatGroq wrapper (server-only GROQ_API_KEY)
│   │   ├── schemas.js               # Zod contracts & LLM output normalization
│   │   ├── middleware/
│   │   │   ├── auth.js              # Firebase ID token verification (req.vendorId)
│   │   │   └── rateLimit.js         # Per-vendor rate limiting
│   │   ├── routes/
│   │   │   ├── forecast.js          # POST /api/forecast, /api/forecast/stream, /api/forecast/resume
│   │   │   ├── logs.js              # POST /api/logs, GET /api/logs
│   │   │   ├── profile.js           # GET/PUT /api/profile, GET /api/runs
│   │   │   ├── voice.js             # POST /api/voice/parse-inventory
│   │   │   ├── whatsapp.js          # GET/POST /api/whatsapp/webhook, POST /api/whatsapp/preview
│   │   │   └── groupBuying.js       # GET /api/group-buying, POST /api/group-buying/opt-in
│   │   ├── jobs/
│   │   │   └── whatsappMorning.js   # 6 AM IST node-cron WhatsApp dispatch + Hindi formatter
│   │   ├── graph/
│   │   │   ├── state.js             # AgentState (Annotation.Root)
│   │   │   ├── build.js             # StateGraph assembly + conditional edges + checkpointer
│   │   │   └── nodes/
│   │   │       ├── loadContext.js   # Profile, inventory, Firestore history & bias
│   │   │       ├── gatherSignals.js # Tool-selecting LLM loop
│   │   │       ├── forecast.js      # Deterministic demand math & draft plan
│   │   │       ├── plan.js          # LLM structured-output review (±25% band)
│   │   │       ├── validate.js      # Code-based critic + deterministic fallback
│   │   │       ├── explain.js       # Bilingual EN/HI briefing + bias notes
│   │   │       ├── humanApproval.js # interrupt() pause/resume + edit diffing
│   │   │       └── save.js          # Persist run to Firestore + update bias from edits
│   │   ├── tools/                   # weather.js, events.js (festivals + local events),
│   │   │                            #   cricket.js, prices.js, search.js (web + social buzz)
│   │   ├── data/                    # baselines.js, cricket.js, festivals.js, prices.js
│   │   ├── learning/
│   │   │   └── bias.js              # EMA bias correction engine (T2.3)
│   │   ├── store/
│   │   │   ├── firestore.js         # Firestore CRUD for profiles, runs, logs, bias, group demand
│   │   │   └── firestoreCheckpointer.js
│   │   └── utils/
│   │       ├── dates.js             # Asia/Kolkata date helpers
│   │       ├── economics.js         # Unit cost, revenue, margin & budget optimizer
│   │       ├── cache.js             # LRU TTL cache for weather, events & prices
│   │       ├── retry.js             # Timeouts & retries for external calls
│   │       └── tracing.js           # Hashed vendor tags & LangSmith/Langfuse metadata
│   ├── evals/
│   │   ├── backtest.js              # Backtest harness (npm run eval)
│   │   └── cases/                   # 24 Lucknow evaluation scenarios (*.json)
│   ├── tests/                       # 17 Vitest suites:
│   │                                #   approval, bias, economics, explain, firestore, forecast,
│   │                                #   gatherSignals, graph, logs, phase3, phase4, profile,
│   │                                #   routes, schemas, tools, validate, voice
│   ├── scripts/                     # dump-mermaid.mjs, probe-interrupt.mjs,
│   │                                #   smoke-graph.mjs, smoke-degraded.mjs
│   ├── package.json
│   ├── vitest.config.js
│   ├── README.md
│   └── .env.example                 # GROQ_API_KEY, Firebase Admin, CORS origin, checkpointer
│
├── Plans.md                         # Full upgrade roadmap (Phases 0–4)
├── README.md                        # Project documentation (this file)
├── firestore.rules                  # Firestore owner-only security rules
└── .gitignore
```

---

## 🤖 Agent Graph (LangGraph.js)

The backend executes daily forecasts through a stateful `StateGraph` (`backend/src/graph/build.js`). Two conditional (dashed) edges implement agentic loops:

- **`validate → planProcurement`** — self-correction loop: rejects arithmetic mismatches, missing items, unit mismatches, or >±25% adjustments (up to 3 retries before falling back to the deterministic draft at `Low` confidence).
- **`humanApproval → planProcurement`** — vendor rejection loop: `humanApproval` calls `interrupt()` so the vendor can edit quantities and approve via `POST /api/forecast/resume`, or reject to regenerate (up to 3 rejections).

Regenerate this diagram from the repository root with `node backend/scripts/dump-mermaid.mjs`:

```mermaid
%%{init: {'flowchart': {'curve': 'linear'}}}%%
graph TD;
	__start__([<p>__start__</p>]):::first
	loadContext(loadContext)
	gatherSignals(gatherSignals)
	forecastDemand(forecastDemand)
	planProcurement(planProcurement)
	validate(validate)
	explain(explain)
	humanApproval(humanApproval)
	save(save)
	__end__([<p>__end__</p>]):::last
	__start__ --> loadContext;
	explain --> humanApproval;
	forecastDemand --> planProcurement;
	gatherSignals --> forecastDemand;
	loadContext --> gatherSignals;
	planProcurement --> validate;
	save --> __end__;
	validate -.-> planProcurement;
	validate -.-> explain;
	humanApproval -.-> save;
	humanApproval -.-> planProcurement;
	classDef default fill:#f2f0ff,line-height:1.2;
	classDef first fill-opacity:0;
	classDef last fill:#bfb6fc;
```

---

## 🔄 Bias Correction Engine (`backend/src/learning/bias.js`)

After a vendor submits their end-of-day sales report (`POST /api/logs`) or edits quantities during plan approval (`humanApproval` → `save`), the bias engine updates per-item (and per-weekday) correction factors using an exponential moving average:

```
OUTCOME_RATIO:  sold_out = 1.20 · just_right = 1.00 · leftover_small = 0.90
                leftover_medium = 0.80 · leftover_large = 0.70 · wasted = 0.65

new_factor = clamp(α × observed_ratio + (1 − α) × old_factor,  min = 0.5, max = 1.8)
             α = 0.25 for daily logs (EMA_ALPHA)
             α = 0.15 for vendor edits at approval (EMA_ALPHA_EDIT)
```

Factors are persisted under `vendors/{vendorId}.biasFactors` in Firestore.

---

## 🌐 Backend API Endpoints

All `/api/*` endpoints require `Authorization: Bearer <firebase_id_token>` and are rate-limited per vendor.

| Method & Path | Purpose |
|---|---|
| `GET /health` | Liveness check (`{ ok, service, time }`) |
| `POST /api/forecast` | Run agent graph; returns `PENDING_APPROVAL` or `DONE` |
| `POST /api/forecast/stream` | Stream node progress (`step`, `pending`, `done`, `error`, `end`) via SSE |
| `POST /api/forecast/resume` | Resume paused `runId` with vendor approval/edits or rejection |
| `POST /api/logs` | Save daily outcomes to Firestore and update learned bias factors |
| `GET /api/logs` | Fetch recent daily logs (default 14, max 30) |
| `GET /api/profile` | Fetch saved vendor profile from Firestore |
| `PUT /api/profile` | Save/update vendor profile in Firestore |
| `GET /api/runs` | Fetch recent saved forecast runs (default 5, max 30) |
| `POST /api/voice/parse-inventory` | Parse Hindi/Hinglish voice transcripts into inventory entries |
| `GET/POST /api/whatsapp/webhook` | Meta/Twilio webhook verification & vendor reply handling (`1`, edits, `STOP`) |
| `POST /api/whatsapp/preview` | Preview/test-send compact Hindi morning WhatsApp briefing |
| `GET /api/group-buying` | Fetch anonymized same-lane item demand across nearby vendors |
| `POST /api/group-buying/opt-in` | Share or withdraw anonymized item quantities for group buying |

---

## 🚀 Running Locally

**1. Clone the repository**
```bash
git clone https://github.com/subrat-dwi/stall-brain.git
cd stall-brain
```

**2. Backend setup**
```bash
cd backend
cp .env.example .env        # fill in GROQ_API_KEY + Firebase Admin credentials + FRONTEND_ORIGIN
npm install
npm run dev                 # Express API on http://localhost:3001
```

**3. Frontend setup** (in a separate terminal)
```bash
cd frontend
cp .env.example .env        # fill in VITE_FIREBASE_* config + VITE_API_URL=http://localhost:3001
npm install
npm run dev                 # Vite dev server on http://localhost:5173
```

Open [http://localhost:5173](http://localhost:5173).

**4. Run backend tests & evaluation**
```bash
cd backend
npm test                    # Vitest unit, integration & API route suites
npm run eval                # 24-case backtest comparing Old Baseline vs New Agent
```

---

## 📊 Phase 4: Evaluation, Observability & Reliability

- **Backtest & Eval Harness (`backend/evals/backtest.js`, `npm run eval`)**: Evaluates 24 Hazratganj stall cases across all 7 stall types (rain, festivals, Ekana matches, social buzz, tomorrow-rain perishables, and learned EMA biases):
  - **MAPE (`totalNeeded`)**: `14.33%` (Old Baseline) → `1.09%` (New Agent)
  - **Stock-Out Rate (>10% short)**: `42.65%` → `0%`
  - **Waste Rate (overbought)**: `4.41%` → `0%`
  - **Validator Pass Rate**: `100%` (`Avg Retries: 0`)
- **Tracing & Node Timings (`backend/src/utils/tracing.js`, `build.js`)**: Every run records `nodeTimings` per graph node and attaches privacy-safe `vendorHash`, stall type, mode, and retry tags for LangSmith (`LANGSMITH_TRACING=true`) or Langfuse.
- **Reliability (`cache.js`, `retry.js`, deterministic LLM fallback)**: `lru-cache` (30-min TTL) caches weather/events/festivals/prices, per-vendor rate limiting protects `/api/*`, and when Groq is unreachable, `gatherSignals`, `planProcurement`, and `explain` degrade deterministically to return a validated `Low`-confidence plan.
- **CI Workflow (`.github/workflows/ci.yml`)**: Runs backend `npm test`, `npm run eval`, and frontend `npm run build` on every push and pull request.

See [`Plans.md`](./Plans.md) for the complete task-by-task roadmap.

---

<div align="center">

Built with 💛 for the street vendors of Hazratganj, Lucknow.

*APL Hackathon 2026*

</div>
