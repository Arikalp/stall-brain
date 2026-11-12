import 'dotenv/config'
import { z } from 'zod'

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3001),
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  // Comma-separated list of allowed browser origins (the Vercel frontend + local dev).
  FRONTEND_ORIGIN: z.string().default('http://localhost:5173'),
  // Server-only secret. Never prefix this with VITE_ and never ship it to the client.
  GROQ_API_KEY: z.string().min(1, 'GROQ_API_KEY is required'),
  // llama-3.3-70b-versatile was decommissioned on Groq; keep the model swappable here.
  GROQ_MODEL: z.string().default('openai/gpt-oss-120b'),
  // Firebase Admin: provide a service account (JSON string or file path) or rely on
  // Application Default Credentials (GOOGLE_APPLICATION_CREDENTIALS / gcloud auth).
  FIREBASE_PROJECT_ID: z.string().optional(),
  FIREBASE_SERVICE_ACCOUNT_JSON: z.string().optional(),
  FIREBASE_SERVICE_ACCOUNT_PATH: z.string().optional(),
  // Optional signal sources: web search (Tavily) and live mandi prices (data.gov.in).
  // Without them the corresponding tools degrade gracefully to curated/mock data.
  TAVILY_API_KEY: z.string().optional(),
  DATA_GOV_IN_API_KEY: z.string().optional(),
  // Checkpointer: 'memory' (dev, non-persistent) or 'firestore' (prod, runs
  // survive restarts so pending approvals are not lost). Firestore mode needs
  // the Firebase Admin credentials above.
  CHECKPOINT_BACKEND: z.enum(['memory', 'firestore']).default('memory'),
  // Optional WhatsApp Cloud API or Twilio WhatsApp delivery (T3.6).
  // Without these, morning messages run in dry-run/mock preview mode.
  WHATSAPP_CRON_ENABLED: z.string().optional(),
  WHATSAPP_TOKEN: z.string().optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_VERIFY_TOKEN: z.string().optional(),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_WHATSAPP_FROM: z.string().optional(),
  // Optional observability & reliability settings (Phase 4: T4.2 / T4.3).
  LANGSMITH_TRACING: z.string().optional(),
  LANGSMITH_API_KEY: z.string().optional(),
  LANGSMITH_PROJECT: z.string().default('bazaar-brain'),
  LANGSMITH_ENDPOINT: z.string().optional(),
  LANGFUSE_PUBLIC_KEY: z.string().optional(),
  LANGFUSE_SECRET_KEY: z.string().optional(),
  LANGFUSE_BASE_URL: z.string().optional(),
  SIGNAL_CACHE_TTL_MS: z.coerce.number().int().positive().default(30 * 60 * 1000),
  LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(20000),
  LLM_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(2),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  const fieldErrors = parsed.error.flatten().fieldErrors
  console.error('[config] Invalid environment configuration:', fieldErrors)
  throw new Error(
    'Invalid environment configuration. Check backend/.env against backend/.env.example.',
  )
}

const origins = parsed.data.FRONTEND_ORIGIN.split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

const defaultDevOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
]

export const config = Object.freeze({
  port: parsed.data.PORT,
  nodeEnv: parsed.data.NODE_ENV,
  isProd: parsed.data.NODE_ENV === 'production',
  allowedOrigins: origins.length ? origins : defaultDevOrigins,
  groqApiKey: parsed.data.GROQ_API_KEY,
  groqModel: parsed.data.GROQ_MODEL,
  firebaseProjectId: parsed.data.FIREBASE_PROJECT_ID,
  firebaseServiceAccountJson: parsed.data.FIREBASE_SERVICE_ACCOUNT_JSON,
  firebaseServiceAccountPath: parsed.data.FIREBASE_SERVICE_ACCOUNT_PATH,
  tavilyApiKey: parsed.data.TAVILY_API_KEY,
  dataGovInApiKey: parsed.data.DATA_GOV_IN_API_KEY,
  checkpointBackend: parsed.data.CHECKPOINT_BACKEND,
  whatsappCronEnabled: parsed.data.WHATSAPP_CRON_ENABLED !== 'false',
  whatsappToken: parsed.data.WHATSAPP_TOKEN,
  whatsappPhoneNumberId: parsed.data.WHATSAPP_PHONE_NUMBER_ID,
  whatsappVerifyToken: parsed.data.WHATSAPP_VERIFY_TOKEN ?? 'bazaar-brain-verify',
  twilioAccountSid: parsed.data.TWILIO_ACCOUNT_SID,
  twilioAuthToken: parsed.data.TWILIO_AUTH_TOKEN,
  twilioWhatsappFrom: parsed.data.TWILIO_WHATSAPP_FROM,
  langsmithTracing: parsed.data.LANGSMITH_TRACING === 'true',
  langsmithApiKey: parsed.data.LANGSMITH_API_KEY,
  langsmithProject: parsed.data.LANGSMITH_PROJECT,
  langsmithEndpoint: parsed.data.LANGSMITH_ENDPOINT,
  langfusePublicKey: parsed.data.LANGFUSE_PUBLIC_KEY,
  langfuseSecretKey: parsed.data.LANGFUSE_SECRET_KEY,
  langfuseBaseUrl: parsed.data.LANGFUSE_BASE_URL,
  signalCacheTtlMs: parsed.data.SIGNAL_CACHE_TTL_MS,
  llmTimeoutMs: parsed.data.LLM_TIMEOUT_MS,
  llmMaxRetries: parsed.data.LLM_MAX_RETRIES,
})

// Bridge LANGSMITH_* vars to LANGCHAIN_* env vars expected by @langchain/core callbacks.
if (config.langsmithTracing && config.langsmithApiKey) {
  process.env.LANGCHAIN_TRACING_V2 ??= 'true'
  process.env.LANGCHAIN_API_KEY ??= config.langsmithApiKey
  process.env.LANGCHAIN_PROJECT ??= config.langsmithProject
  if (config.langsmithEndpoint) {
    process.env.LANGCHAIN_ENDPOINT ??= config.langsmithEndpoint
  }
}
