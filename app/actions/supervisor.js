'use server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { revalidatePath, updateTag } from 'next/cache'
import { redirect } from 'next/navigation'
import { homeForRole } from '@/lib/roles'
import { CREDENTIAL_CACHE_TAG } from '@/lib/supabase/cached'

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
  revalidatePath('/admin')
  revalidatePath('/admin/uploads')
  revalidatePath('/admin/users')
  updateTag(CREDENTIAL_CACHE_TAG)
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

// ============ UNASSIGN PENDING ROWS ============
export async function supervisorUnassign(credentialIds) {
  const supervisor = await requireSupervisor()
  const adminSupabase = createAdminClient()

  if (!credentialIds?.length) return { error: 'No credentials selected.' }
  if (credentialIds.length > 50) {
    return { error: 'Max 50 per batch. Please split into smaller batches.' }
  }

  // Only pending rows assigned by this supervisor can be taken back. Done or
  // error rows keep their result so a user cannot lose submitted work.
  const { data: owned, error: fetchError } = await adminSupabase
    .from('email_credentials')
    .select('id')
    .in('id', credentialIds)
    .eq('assigned_by', supervisor.id)
    .eq('status', 'pending')
    .not('assigned_to', 'is', null)

  if (fetchError) return { error: fetchError.message }
  if (!owned?.length) {
    return { error: 'Only pending credentials you assigned can be unassigned.' }
  }

  const ids = owned.map(row => row.id)
  const { error } = await adminSupabase
    .from('email_credentials')
    .update({
      assigned_to: null,
      assign_date: null,
      assigned_at: null,
      assigned_by: null,
      status: 'pending',
      completed_at: null,
    })
    .in('id', ids)
    .eq('assigned_by', supervisor.id)
    .eq('status', 'pending')

  if (error) return { error: error.message }

  revalidateSupervisorViews()
  return {
    success: true,
    updated: ids.length,
    skipped: credentialIds.length - ids.length,
  }
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
