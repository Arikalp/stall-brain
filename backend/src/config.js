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
})
