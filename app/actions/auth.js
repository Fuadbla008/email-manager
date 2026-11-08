'use server'

import { createClient } from '@/lib/supabase/server'
import { homeForRole } from '@/lib/roles'
import { redirect } from 'next/navigation'

export async function login(formData) {
  const email = String(formData.get('email') ?? '').trim()
  const password = String(formData.get('password') ?? '')

  const supabase = await createClient()
  // signInWithPassword already returns the authenticated user, so there is no
  // need for a second `getUser()` round trip before the profile lookup.
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) return { error: error.message }

  const user = data?.user
  if (!user) return { error: 'Could not start a session. Please try again.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  redirect(homeForRole(profile?.role))
}
