export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { config } from '@/lib/server/config'
import { signSessionToken } from '@/lib/server/lib/sessionToken'

const DEMO_VENDOR = {
  sub: 'demo-vendor-hazratganj',
  email: 'demo@bazaarbrain.in',
  name: 'Ramesh Kumar (Demo Vendor)',
  picture: '/logo-icon.png',
}

export async function GET() {
  const secret = config.sessionSecret || 'default_demo_session_secret_for_stall_brain'
  const ttlSeconds = config.sessionTtlSeconds || 30 * 24 * 60 * 60

  const token = signSessionToken(DEMO_VENDOR, {
    secret,
    ttlSeconds,
  })

  return NextResponse.json({
    token,
    user: {
      vendorId: DEMO_VENDOR.sub,
      email: DEMO_VENDOR.email,
      name: DEMO_VENDOR.name,
      picture: DEMO_VENDOR.picture,
    },
  })
}
