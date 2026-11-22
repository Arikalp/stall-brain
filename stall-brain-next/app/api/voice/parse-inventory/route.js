export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/server/requireAuth'
import { checkRateLimit } from '@/lib/server/rateLimit'
import { VoiceInventoryRequestSchema } from '@/lib/server/schemas'
import { parseVoiceTranscript } from '@/lib/server/voiceParser'

export async function POST(request) {
  const { vendorId, error, status } = await requireAuth(request)
  if (error) {
    return NextResponse.json({ error: 'AUTH_REQUIRED', message: error }, { status })
  }

  const { limited } = checkRateLimit(vendorId)
  if (limited) {
    return NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 })
  }

  const body = await request.json().catch(() => null)
  const parsedBody = VoiceInventoryRequestSchema.safeParse(body)
  if (!parsedBody.success) {
    return NextResponse.json(
      {
        error: 'VALIDATION_FAILED',
        message: 'Provide { transcript, knownItems? }.',
        details: parsedBody.error.flatten().fieldErrors,
      },
      { status: 400 }
    )
  }

  try {
    const result = await parseVoiceTranscript(parsedBody.data)
    return NextResponse.json({
      transcript: parsedBody.data.transcript,
      items: result.items,
      method: result.method,
    })
  } catch (err) {
    console.error('[voice] parse error:', err?.message)
    return NextResponse.json({ error: 'INTERNAL_ERROR', message: err?.message }, { status: 500 })
  }
}
