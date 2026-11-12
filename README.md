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
`EndOfDayLog.jsx` lets vendors log per-item outcomes (`Sold out early`, `Just right`, `Leftover` small/medium/large, `Wasted`) in two taps per item (`POST /api/logs`). `backend/src/learning/bias.js` updates per-item and per-weekday EMA factors in Firestore (`vendors/{uid}.biasFactors`) from both daily logs and approval edits, and explains adjustments back to the vendor.

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
│   │   │   └── profile.js           # GET/PUT /api/profile, GET /api/runs
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
│   │   │                            #   cricket.js, prices.js, search.js
│   │   ├── data/                    # baselines.js, cricket.js, festivals.js, prices.js
│   │   ├── learning/
│   │   │   └── bias.js              # EMA bias correction engine (T2.3)
│   │   ├── store/
│   │   │   ├── firestore.js         # Firestore CRUD for profiles, runs, logs, biasFactors
│   │   │   └── firestoreCheckpointer.js
│   │   └── utils/
│   │       └── dates.js             # Asia/Kolkata date helpers
│   ├── tests/                       # 13 Vitest suites:
│   │                                #   approval, bias, explain, firestore, forecast,
│   │                                #   gatherSignals, graph, logs, profile, routes,
│   │                                #   schemas, tools, validate
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

**4. Run backend tests**
```bash
cd backend
npm test
```

---

## 🔭 What's Next (Phases 3–4)

| Phase | Planned Features |
|---|---|
| **Phase 3** | Hindi voice input/output · profit & budget optimization · shelf-life & spoilage awareness · 3-day lookahead · what-if simulation mode · WhatsApp morning delivery (`node-cron`) · PWA & offline log sync · crowd/social buzz · group buying |
| **Phase 4** | Backtest & eval harness (`MAPE`, stock-out/waste rates) · LangSmith/Langfuse tracing · caching, timeouts & LLM-down deterministic fallback · CI test workflow |

See [`Plans.md`](./Plans.md) for the complete task-by-task roadmap.

---

<div align="center">

Built with 💛 for the street vendors of Hazratganj, Lucknow.

*APL Hackathon 2026*

</div>
