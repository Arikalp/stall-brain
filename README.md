<div align="center">

<img src="https://img.shields.io/badge/PS--11-Hyperlocal%20demand%20forecasting%20for%20Hazratganj%20Demand%20Forecasting-F59E0B?style=for-the-badge" />
&nbsp;

&nbsp;
<img src="https://img.shields.io/badge/Live-stall--brain.vercel.app-4ADE80?style=for-the-badge&logo=vercel&logoColor=white" href="https://stall-brain.vercel.app" />

<br /><br />

# 🧠 Bazaar Brain

### *रोज़ का हिसाब, AI का जवाब*
*Daily stock decisions, answered by AI*

**An agentic AI demand forecasting tool for street vendors in Hazratganj, Lucknow —**  
combining live weather, local events, and custom inventory to deliver daily procurement recommendations.

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

## 🎯 Problem Statement — PS-11

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

Bazaar Brain is a **multi-page agentic web app** that acts as a daily procurement advisor for street vendors. A vendor picks their stall type, customizes their item list, and the AI agent synthesizes live weather data, a Lucknow-specific event calendar, and weekly footfall patterns to produce a precise, actionable stock recommendation — in English and Hindi.

The AI doesn't just answer a prompt. It **reasons across multiple data signals** before generating output, making it genuinely agentic rather than a simple chatbot.

---

## ✨ Features

**Stall Profiles**
Seven vendor types built around Lucknow's actual street economy — Chaat Stall, Chai Tapri, Juice Corner, Flower Vendor, Bhutta Stall, Snacks & Namkeen, and Balloon Seller — each with pre-loaded default inventory.

**Editable Inventory**
Vendors can add, remove, or rename items in their stall list before forecasting. The AI uses only the vendor's actual items — no generic suggestions.

**Live Lucknow Weather**
Fetches real-time weather from Open-Meteo using Hazratganj's exact coordinates (26.85°N, 80.95°E) and maps conditions to footfall impact multipliers. Rain doesn't just mean "bad weather" — it means 0.4x footfall for chaat but a boost for bhutta.

**Lucknow Event Radar**
A built-in calendar of local events — Lucknow Mahotsav, Navratri, IPL LSG home matches at Ekana, public holidays, and weekly footfall patterns — feeds into the demand calculation before the AI ever sees the prompt.

**Demand Multiplier Engine**
Before calling the LLM, the system computes:

```
Demand Multiplier = Weather Impact × Event Impact × Day-of-Week Pattern
```

This structured signal is passed to the model, grounding the AI output in real numbers rather than vibes.

**Bilingual Output**
Every forecast is available in English and Hindi (Devanagari), because a tool is only useful if the vendor can actually read it.

**Forecast History & Feedback**
Past forecasts are stored locally. Vendors can mark predictions as accurate or not, creating a personal accuracy log over time.

---

## 🗺️ App Flow

```
Landing Page  →  Setup Page  →  Forecast Page
(welcome +        (pick stall      (live signals +
 how it works)     + edit items)    AI output)
```

The app is structured across three pages with a clear stepper, ensuring vendors always know where they are and what to do next.

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19 + Vite |
| Styling | Tailwind CSS v4 + CSS Variables |
| Routing | React Router v6 |
| AI / LLM | Groq API — `llama-3.3-70b-versatile` |
| Weather | Open-Meteo API (free, no key required) |
| Icons | Lucide React |
| Storage | localStorage (forecast history + feedback) |
| Deployment | Vercel |

Coding Agent used : Copilot with GPT Codex


## 🏗️ Architecture

High-level: Client SPA → Signal Engine → Agent → LLM → UI & Storage


Key components:

- Frontend: `src/main.jsx`, `src/App.jsx` (routing), `src/pages/*`, `src/components/*`
- Signal engine: `src/utils/weatherLogic.js` (weather/event → multipliers)
- Agent: `src/utils/groqAgent.js` (prompt assembly, POST → Groq)
- Storage: `src/utils/selectionStorage.js` (localStorage)
- Static data: `src/data/stalls.js`, `src/data/events.js`
- Env: `VITE_GROQ_API_KEY`
- Deployment: Vercel (static)

Data contracts:

- `DemandMultiplier` = { weather: number, event: number, weekday: number, combined: number }
- `ForecastRequest` = { stallType: string, items: [{ name: string, baseQty: number }], multipliers: DemandMultiplier, locale: 'en' | 'hi' }

Integration:

- Open-Meteo: GET /weather → `weatherLogic`
- Groq LLM: POST /v1/predict ← `groqAgent.js` (JSON payload)


---

## 🚀 Running Locally

**1. Clone the repository**
```bash
git clone https://github.com/placeholder/bazaar-brain.git
cd bazaar-brain
```

**2. Add your Groq API key**

Create a `.env` file at the project root:
```
VITE_GROQ_API_KEY=your_groq_api_key_here
```
Get a free key at [console.groq.com](https://console.groq.com/) — no credit card needed.

**3. Install and run**
```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

---

## 🔭 What's Next

- **WhatsApp delivery** — send the daily forecast directly to a vendor's phone each morning
- **Crowdsourced social signals** — parse local hashtags like `#Hazratganj` and `#LucknowFoodies` to catch viral footfall spikes
- **Group buying** — aggregate demand across nearby vendors to unlock wholesale pricing on shared items

---

<div align="center">

Built with 💛 for the street vendors of Hazratganj, Lucknow.

*APL Hackathon 2026*

</div>
