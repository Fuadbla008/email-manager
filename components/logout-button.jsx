'use client'

import { useState } from 'react'
import { Loader2, LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cacheRemovePrefix } from '@/lib/client-cache'
import { Button } from '@/components/ui/button'

/**
 * Sign out without waiting on the network.
 *
 * `scope: 'local'` clears the browser session immediately, so a slow VPN or a
 * flaky connection cannot leave the button stuck. A hard navigation then
 * guarantees no stale router/RSC state survives the sign-out.
 */
export default function LogoutButton({ className = '' }) {
  const [pending, setPending] = useState(false)

  async function handleLogout() {
    if (pending) return
    setPending(true)
    try {
      const supabase = createClient()
      await supabase.auth.signOut({ scope: 'local' })
    } catch {
      // Storage cleanup can fail on locked-down browsers; the redirect below
      // still sends the user to the login page.
    }
    cacheRemovePrefix('')
    window.location.replace('/login')
  }

  return (
    <Button
      variant="outline"
      type="button"
      onClick={handleLogout}
      disabled={pending}
      className={`w-full border-white/20 bg-white text-slate-900 hover:bg-slate-100 hover:text-slate-900 ${className}`}
    >
      {pending ? <Loader2 className="animate-spin" /> : <LogOut />}
      {pending ? 'Signing out…' : 'Logout'}
    </Button>
  )
}
