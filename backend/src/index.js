import { pathToFileURL } from 'node:url'
import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import { config } from './config.js'
import { initFirebaseAdmin } from './middleware/auth.js'
import { forecastRouter } from './routes/forecast.js'

export function createApp() {
  const app = express()

  app.use(helmet())
  app.use(
    cors({
      // Only the deployed frontend + local dev origins may call this API.
      origin: (origin, callback) => {
        if (!origin || config.allowedOrigins.includes(origin)) {
          return callback(null, true)
        }
        return callback(new Error('Origin not allowed by CORS'))
      },
      methods: ['GET', 'POST', 'OPTIONS'],
    }),
  )
  app.use(express.json({ limit: '256kb' }))

  app.get('/health', (_req, res) => {
    res.json({
      ok: true,
      service: 'bazaar-brain-backend',
      time: new Date().toISOString(),
    })
  })

  app.use('/api', forecastRouter)

  app.use((_req, res) => {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Unknown endpoint.' })
  })

  // eslint-disable-next-line no-unused-vars
  app.use((error, req, res, next) => {
    if (error?.message === 'Origin not allowed by CORS') {
      return res
        .status(403)
        .json({ error: 'FORBIDDEN', message: 'Origin not allowed.' })
    }
    console.error('[server] Unhandled error:', error)
    return res
      .status(500)
      .json({ error: 'INTERNAL_ERROR', message: 'Unexpected server error.' })
  })

  return app
}

export async function start() {
  // Fail fast if Firebase admin credentials are unusable; do not serve an open API.
  initFirebaseAdmin()

  const app = createApp()
  const server = app.listen(config.port, () => {
    console.log(
      `[server] Bazaar Brain backend listening on http://localhost:${config.port} (${config.nodeEnv})`,
    )
    console.log(`[server] CORS origins: ${config.allowedOrigins.join(', ')}`)
    console.log(`[server] Groq model: ${config.groqModel}`)
  })
  return server
}

const isMainModule =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href

if (isMainModule) {
  start().catch((error) => {
    console.error('[server] Failed to start:', error.message)
    process.exit(1)
  })
}
