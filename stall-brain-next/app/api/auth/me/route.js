export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/server/requireAuth'

export async function GET(request) {
  const { vendorId, auth, error, status } = await requireAuth(request)
  if (error) {
    return NextResponse.json({ error: 'AUTH_REQUIRED', message: error }, { status })
  }

  return NextResponse.json({
    vendorId,
    email: auth?.email ?? '',
    name: auth?.name ?? '',
    picture: auth?.picture ?? '',
  })
}
