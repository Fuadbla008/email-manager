import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

/**
 * Server-component guard. Returns the cookie-bound client, auth user, and profile.
 * Redirects unauthenticated users to /login and wrong-role users to their home.
 */
export async function requireRole(allowedRoles) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name, email')
    .eq('id', user.id)
    .single()

  if (!profile || !allowedRoles.includes(profile.role)) redirect('/')

  return { supabase, user, profile }
}
