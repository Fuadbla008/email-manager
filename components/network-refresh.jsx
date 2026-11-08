'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/**
 * After a VPN/network switch the browser can come back with an old server
 * render and stale auth state. Refresh the route data once the connection is
 * restored so the dashboard does not stay stuck on empty/error state.
 */
export default function NetworkRefresh() {
  const router = useRouter()

  useEffect(() => {
    let lastRefresh = 0

    function handleOnline() {
      const now = Date.now()
      if (now - lastRefresh < 2000) return
      lastRefresh = now
      router.refresh()
    }

    window.addEventListener('online', handleOnline)
    return () => window.removeEventListener('online', handleOnline)
  }, [router])

  return null
}
