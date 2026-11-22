export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/server/requireAuth'
import { checkRateLimit } from '@/lib/server/rateLimit'
import { getGroupDemand, getVendorProfile, recordGroupDemand, saveVendorProfile } from '@/lib/server/store/firestore'
import { todayIso } from '@/lib/server/utils/dates'

const GroupOptInSchema = z.object({
  optIn: z.boolean(),
  lane: z.string().trim().min(1).max(60).default('Hazratganj'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  items: z
    .array(
      z.object({
        item: z.string().min(1),
        toBuy: z.coerce.number().nonnegative(),
        unit: z.string().min(1).default('units'),
      }),
    )
    .default([]),
})

export async function POST(request) {
  const { vendorId, error, status } = await requireAuth(request)
  if (error) {
    return NextResponse.json({ error: 'AUTH_REQUIRED', message: error }, { status })
  }

  const { limited } = checkRateLimit(vendorId)
  if (limited) {
    return NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 })
  }

  const body = await request.json().catch(() => ({}))
  const parsed = GroupOptInSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'VALIDATION_FAILED',
        message: 'Invalid group-buying payload.',
        details: parsed.error.flatten().fieldErrors,
      },
      { status: 400 }
    )
  }

  try {
    const date = parsed.data.date ?? todayIso()
    const { profile } = await getVendorProfile(vendorId)
    if (profile?.stallType) {
      await saveVendorProfile(vendorId, {
        ...profile,
        lane: parsed.data.lane,
        groupBuyingOptIn: parsed.data.optIn,
      })
    }

    await recordGroupDemand({
      vendorId,
      lane: parsed.data.lane,
      date,
      items: parsed.data.items,
      optIn: parsed.data.optIn,
    })

    const snapshot = await getGroupDemand({
      lane: parsed.data.lane,
      date,
      vendorId,
    })
    return NextResponse.json({ ok: true, ...snapshot })
  } catch (err) {
    console.error('[group-buying/opt-in] error:', err?.message)
    return NextResponse.json({ error: 'INTERNAL_ERROR', message: err?.message }, { status: 500 })
  }
}
