export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/server/requireAuth'
import { checkRateLimit } from '@/lib/server/rateLimit'
import { VoiceInventoryRequestSchema } from '@/lib/server/schemas'
import { parseVoiceTranscript, transcribeAudioBuffer } from '@/lib/server/voiceParser'

export async function POST(request) {
  const { vendorId, error, status } = await requireAuth(request)
  if (error) {
    return NextResponse.json({ error: 'AUTH_REQUIRED', message: error }, { status })
  }

  const { limited } = checkRateLimit(vendorId)
  if (limited) {
    return NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 })
  }

  const contentType = request.headers.get('content-type') || ''
  let transcript = ''
  let knownItems = []
  let usedWhisper = false

  if (contentType.includes('multipart/form-data')) {
    try {
      const formData = await request.formData()
      const audioFile = formData.get('audio') || formData.get('file')
      const rawKnown = formData.get('knownItems')
      if (rawKnown) {
        try {
          const parsed = JSON.parse(rawKnown)
          if (Array.isArray(parsed)) knownItems = parsed
        } catch {}
      }

      if (!audioFile || typeof audioFile.arrayBuffer !== 'function') {
        return NextResponse.json(
          { error: 'VALIDATION_FAILED', message: 'No valid audio recording was provided.' },
          { status: 400 }
        )
      }

      const buffer = Buffer.from(await audioFile.arrayBuffer())
      if (!buffer.length) {
        return NextResponse.json(
          { error: 'VALIDATION_FAILED', message: 'Audio recording is empty.' },
          { status: 400 }
        )
      }

      transcript = await transcribeAudioBuffer({
        buffer,
        mimeType: audioFile.type || 'audio/webm',
      })
      usedWhisper = true
    } catch (err) {
      console.error('[voice] Whisper error:', err?.message)
      return NextResponse.json(
        { error: 'AUDIO_TRANSCRIPTION_FAILED', message: err?.message || 'Speech audio could not be transcribed.' },
        { status: 500 }
      )
    }
  } else {
    const body = await request.json().catch(() => null)
    const parsedBody = VoiceInventoryRequestSchema.safeParse(body)
    if (!parsedBody.success) {
      return NextResponse.json(
        {
          error: 'VALIDATION_FAILED',
          message: 'Provide { transcript, knownItems? } or multipart audio.',
          details: parsedBody.error.flatten().fieldErrors,
        },
        { status: 400 }
      )
    }
    transcript = parsedBody.data.transcript
    knownItems = parsedBody.data.knownItems || []
  }

  if (!transcript || !transcript.trim()) {
    return NextResponse.json({
      transcript: '',
      items: [],
      method: usedWhisper ? 'whisper' : 'empty',
    })
  }

  try {
    const result = await parseVoiceTranscript({ transcript, knownItems })
    return NextResponse.json({
      transcript,
      items: result.items,
      method: usedWhisper ? `whisper+${result.method}` : result.method,
    })
  } catch (err) {
    console.error('[voice] parse error:', err?.message)
    return NextResponse.json({ error: 'INTERNAL_ERROR', message: err?.message }, { status: 500 })
  }
}
