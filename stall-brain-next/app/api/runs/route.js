export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/server/requireAuth'
import { checkRateLimit } from '@/lib/server/rateLimit'
import { getRecentRuns } from '@/lib/server/store/firestore'

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
  const parsedLimit = z.coerce
    .number()
    .int()
    .min(1)
    .max(30)
    .safeParse(url.searchParams.get('limit'))

  try {
    let runs
    try {
      runs = await getRecentRuns(vendorId, parsedLimit.success ? parsedLimit.data : 5)
    } catch {
      runs = []
    }
    return NextResponse.json({ runs })
  } catch (err) {
    console.error('[runs] error:', err?.message)
    return NextResponse.json({ runs: [] })
  }
}
