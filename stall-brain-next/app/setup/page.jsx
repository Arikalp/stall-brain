'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import RequireAuth from '@/components/RequireAuth'

function SetupRedirect() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/profile')
  }, [router])
  return null
}

export default function SetupPage() {
  return (
    <RequireAuth>
      <SetupRedirect />
    </RequireAuth>
  )
}
