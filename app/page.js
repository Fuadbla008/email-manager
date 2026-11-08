import { connection } from 'next/server'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { homeForRole } from '@/lib/roles'

// This route reads the auth cookie and redirects; it cannot be prerendered.
export const instant = false

export default async function Home() {
  // Auth helpers call Date.now internally for token expiry, so render at
  // request time instead of trying to prerender this route.
  await connection()
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  redirect(homeForRole(profile?.role))
}