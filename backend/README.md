# Bazaar Brain backend

Express API that hides the Groq API key from the browser bundle and authenticates
every request with Firebase ID tokens.

## Run

```bash
npm install
cp .env.example .env   # fill in GROQ_API_KEY + Firebase admin config
npm run dev            # http://localhost:3001
```

The frontend expects `VITE_API_URL` (default `http://localhost:3001`) in the
root `.env`.

## Environment

| Variable | Required | Notes |
| --- | --- | --- |
| `PORT` | no | Default `3001`. |
| `NODE_ENV` | no | `development` / `production`. |
| `FRONTEND_ORIGIN` | no | Comma-separated browser origins allowed by CORS. Add your Vercel URL in production. |
| `GROQ_API_KEY` | **yes** | Server-only secret. Never prefix with `VITE_`. |
| `GROQ_MODEL` | no | Default `openai/gpt-oss-120b`. |
| `FIREBASE_SERVICE_ACCOUNT_JSON` / `FIREBASE_SERVICE_ACCOUNT_PATH` | one of these or ADC | Service account for full admin access. |
| `FIREBASE_PROJECT_ID` | yes (if no service account) | Verification-only mode: ID tokens are still fully verified; token-minting admin APIs are unavailable. |

Never commit `.env` or `service-account.json` (both are gitignored).

## Endpoints

- `GET /health` — liveness check.
- `POST /api/forecast` — body: forecast request (stall, items, inventory, date,
  weather, event signals, multipliers). Requires `Authorization: Bearer <firebase-id-token>`.
  Returns the validated forecast result. Rate limited to 30 requests / 15 min per vendor.
