'use server'

import { after } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { updateTag } from 'next/cache'
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

  // Ownership is checked with the user-scoped client first; the actual write
  // then uses the service-role client so RLS cannot silently drop it.
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

  // The audit log is important but must not delay the user's optimistic UI.
  // `after` runs it once the action response has been sent.
  const logs = owned.map(o => ({
    user_id: user.id,
    credential_id: o.id,
    old_status: o.status,
    new_status: newStatus,
  }))
  after(async () => {
    const { error: logErr } = await admin.from('activity_logs').insert(logs)
    if (logErr) console.error('activity_logs insert failed:', logErr.message)
  })

  // Supervisor overview/reports read through this tag. Everything else in the
  // app is request-time data, so per-path revalidation would only add latency.
  updateTag(CREDENTIAL_CACHE_TAG)

  return { success: true, updated: validIds.length, updatedIds: validIds }
}
