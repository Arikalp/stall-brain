export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/server/requireAuth'
import { checkRateLimit } from '@/lib/server/rateLimit'
import { getGroupDemand, getVendorProfile } from '@/lib/server/store/firestore'
import { todayIso } from '@/lib/server/utils/dates'

export async function GET(request) {
  const { vendorId, error, status } = await requireAuth(request)
  if (error) {
    return NextResponse.json({ error: 'AUTH_REQUIRED', message: error }, { status })
  }

  const { limited } = checkRateLimit(vendorId)
  if (limited) {
    return NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 })
  }

  const url = new URL(request.url)
  try {
    const { profile } = await getVendorProfile(vendorId)
    const laneParam = url.searchParams.get('lane')
    const lane = laneParam && laneParam.trim() ? laneParam.trim() : (profile?.lane ?? 'Hazratganj')
    const dateParam = url.searchParams.get('date')
    const date = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : todayIso()

    const data = await getGroupDemand({
      lane,
      date,
      vendorId,
    })
    return NextResponse.json(data)
  } catch (err) {
    console.error('[group-buying] error:', err?.message)
    return NextResponse.json({ error: 'INTERNAL_ERROR', message: err?.message }, { status: 500 })
  }
}
