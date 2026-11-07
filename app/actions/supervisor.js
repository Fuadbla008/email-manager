'use server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { homeForRole } from '@/lib/roles'

async function requireSupervisor() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name, email')
    .eq('id', user.id)
    .single()

  if (!profile || !['supervisor', 'admin'].includes(profile.role)) {
    redirect(homeForRole(profile?.role))
  }
  return user
}

async function assertAssignableUser(adminSupabase, userId) {
  if (!userId) return 'Select a user first.'
  const { data: target, error } = await adminSupabase
    .from('profiles')
    .select('id, role')
    .eq('id', userId)
    .single()
  if (error || !target) return 'User not found.'
  if (target.role !== 'user') return 'Credentials can only be assigned to a user account.'
  return null
}

function revalidateSupervisorViews() {
  revalidatePath('/supervisor')
  revalidatePath('/supervisor/assign')
  revalidatePath('/supervisor/reports')
  revalidatePath('/admin')
  revalidatePath('/admin/assign')
  revalidatePath('/admin/uploads')
  revalidatePath('/admin/credentials')
  revalidatePath('/admin/users')
  revalidatePath('/admin/reports')
  revalidatePath('/user')
  revalidatePath('/user/reports')
}

// ============ ASSIGN SELECTED ROWS ============
export async function supervisorAssignSelected(credentialIds, userId, date, uploadDate) {
  const supervisor = await requireSupervisor()
  const adminSupabase = createAdminClient()

  if (!credentialIds?.length) return { error: 'No credentials selected.' }
  if (!date) return { error: 'Assign date required.' }
  if (!uploadDate) return { error: 'Upload date required.' }

  const userError = await assertAssignableUser(adminSupabase, userId)
  if (userError) return { error: userError }

  const CHUNK = 100
  const assignedAt = new Date().toISOString()
  let updated = 0

  for (let i = 0; i < credentialIds.length; i += CHUNK) {
    const ids = credentialIds.slice(i, i + CHUNK)
    const { data, error } = await adminSupabase
      .from('email_credentials')
      .update({
        assigned_to: userId,
        assign_date: date,
        assigned_at: assignedAt,
        assigned_by: supervisor.id,
      })
      .in('id', ids)
      .is('assigned_to', null)
      .eq('upload_date', uploadDate)
      .select('id')

    if (error) return { error: error.message, updated }
    updated += data?.length ?? 0
  }

  revalidateSupervisorViews()
  return { success: true, updated }
}

// ============ ASSIGN BY QUANTITY ============
export async function supervisorAssignNext(userId, date, count, uploadDate) {
  const supervisor = await requireSupervisor()
  const adminSupabase = createAdminClient()

  if (!date) return { error: 'Assign date required.' }
  if (!uploadDate) return { error: 'Upload date required.' }

  const userError = await assertAssignableUser(adminSupabase, userId)
  if (userError) return { error: userError }

  const requested = Number(count)
  if (!Number.isInteger(requested) || requested < 1) {
    return { error: 'Enter a valid number greater than 0.' }
  }
  const limit = Math.min(requested, 500)

  const { data: pool, error: fetchError } = await adminSupabase
    .from('email_credentials')
    .select('id')
    .is('assigned_to', null)
    .eq('upload_date', uploadDate)
    .order('created_at', { ascending: true })
    .limit(limit)

  if (fetchError) return { error: fetchError.message }
  if (!pool?.length) {
    return { error: 'No unassigned credentials left for this upload date.' }
  }

  const CHUNK = 100
  const assignedAt = new Date().toISOString()
  let updated = 0

  for (let i = 0; i < pool.length; i += CHUNK) {
    const ids = pool.slice(i, i + CHUNK).map(r => r.id)
    const { data, error } = await adminSupabase
      .from('email_credentials')
      .update({
        assigned_to: userId,
        assign_date: date,
        assigned_at: assignedAt,
        assigned_by: supervisor.id,
      })
      .in('id', ids)
      .is('assigned_to', null)
      .eq('upload_date', uploadDate)
      .select('id')

    if (error) return { error: error.message, updated }
    updated += data?.length ?? 0
  }

  revalidateSupervisorViews()
  return {
    success: true,
    updated,
    requested: limit,
    shortfall: Math.max(0, limit - updated),
  }
}
