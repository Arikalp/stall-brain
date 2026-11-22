export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/server/requireAuth'
import { checkRateLimit } from '@/lib/server/rateLimit'
import { VendorProfileSchema } from '@/lib/server/schemas'
import { getVendorProfile, saveVendorProfile } from '@/lib/server/store/firestore'

export async function GET(request) {
  const { vendorId, error, status } = await requireAuth(request)
  if (error) {
    return NextResponse.json({ error: 'AUTH_REQUIRED', message: error }, { status })
  }

  const { limited } = checkRateLimit(vendorId)
  if (limited) {
    return NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 })
  }

  try {
    const { profile } = await getVendorProfile(vendorId)
    return NextResponse.json({ profile })
  } catch (err) {
    console.warn('[profile] fetch failed:', err?.message)
    return NextResponse.json({ profile: null })
  }
}

export async function PUT(request) {
  const { vendorId, error, status } = await requireAuth(request)
  if (error) {
    return NextResponse.json({ error: 'AUTH_REQUIRED', message: error }, { status })
  }

  const { limited } = checkRateLimit(vendorId)
  if (limited) {
    return NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 })
  }

  const body = await request.json().catch(() => null)
  const parsedBody = VendorProfileSchema.safeParse(body)
  if (!parsedBody.success) {
    return NextResponse.json(
      {
        error: 'VALIDATION_FAILED',
        message: 'Profile must be { stallType, stallLabel, stallEmoji, ingredients[] }.',
        details: parsedBody.error.flatten().fieldErrors,
      },
      { status: 400 }
    )
  }

  try {
    const result = await saveVendorProfile(vendorId, parsedBody.data)
    if (!result.saved) {
      return NextResponse.json(
        {
          error: 'SAVE_FAILED',
          message: 'Could not save your profile right now. Please try again.',
        },
        { status: 503 }
      )
    }
    return NextResponse.json({ saved: true, profile: parsedBody.data })
  } catch (err) {
    console.error('[profile] save error:', err?.message)
    return NextResponse.json({ error: 'INTERNAL_ERROR', message: err?.message }, { status: 500 })
  }
}
