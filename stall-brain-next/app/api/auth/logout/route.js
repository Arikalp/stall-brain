export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/server/requireAuth'

export async function POST(request) {
  const { error, status } = await requireAuth(request)
  if (error) {
    return NextResponse.json({ error: 'AUTH_REQUIRED', message: error }, { status })
  }

  return NextResponse.json({ ok: true })
}
