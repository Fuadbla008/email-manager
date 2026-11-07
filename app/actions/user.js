'use server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { revalidatePath, updateTag } from 'next/cache'
import { CREDENTIAL_CACHE_TAG } from '@/lib/supabase/cached'

export async function updateStatus(credentialIds, newStatus) {
  if (!['pending', 'done', 'error'].includes(newStatus)) {
    return { error: 'Invalid status' }
  }
  const ids = Array.isArray(credentialIds) ? credentialIds : [credentialIds]
  if (ids.length === 0) return { error: 'No items selected' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: owned, error: fetchErr } = await supabase
    .from('email_credentials')
    .select('id, status')
    .in('id', ids)
    .eq('assigned_to', user.id)

  if (fetchErr) return { error: fetchErr.message }
  if (!owned || owned.length === 0) return { error: 'No valid items found' }

  const validIds = owned.map(o => o.id)
  const admin = createAdminClient()

  const completedAt = newStatus === 'pending' ? null : new Date().toISOString()

  const { error: updateErr } = await admin
    .from('email_credentials')
    .update({ status: newStatus, completed_at: completedAt })
    .in('id', validIds)

  if (updateErr) return { error: updateErr.message }

  const logs = owned.map(o => ({
    user_id: user.id,
    credential_id: o.id,
    old_status: o.status,
    new_status: newStatus,
  }))
  await admin.from('activity_logs').insert(logs)

  revalidatePath('/user')
  revalidatePath('/user/reports')
  // Supervisors and admins see claim/verification progress for these rows.
  revalidatePath('/supervisor')
  revalidatePath('/supervisor/reports')
  revalidatePath('/admin')
  revalidatePath('/admin/users')
  revalidatePath('/admin/activity')
  revalidatePath('/admin/reports')
  // Drop the short-lived supervisor dashboard cache so counts change instantly.
  updateTag(CREDENTIAL_CACHE_TAG)
  return { success: true, updated: validIds.length }
}