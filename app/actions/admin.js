'use server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { revalidatePath, updateTag } from 'next/cache'
import { redirect } from 'next/navigation'
import { ROLES, homeForRole } from '@/lib/roles'
import { CREDENTIAL_CACHE_TAG } from '@/lib/supabase/cached'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (profile?.role !== 'admin') redirect(homeForRole(profile?.role))
  return user
}

// Revalidate the server-rendered count surfaces. Client-side pages (assign,
// credentials, reports) refresh their own data, so revalidating them would only
// force an unnecessary router refresh and make the action feel slower.
function revalidateCredentialViews() {
  revalidatePath('/admin')
  revalidatePath('/admin/uploads')
  revalidatePath('/admin/users')
  revalidatePath('/admin/activity')
  updateTag(CREDENTIAL_CACHE_TAG)
}

// ============ UPLOAD ============
export async function uploadCredentials(formData) {
  const adminUser = await requireAdmin()
  const adminSupabase = createAdminClient()

  const uploadDate = String(formData.get('uploadDate') ?? '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(uploadDate)) {
    return { error: 'Choose the upload date (YYYY-MM-DD) before uploading.' }
  }

  const rowsJson = formData.get('rows')
  let rows
  try {
    rows = JSON.parse(rowsJson)
  } catch {
    return { error: 'Invalid data format.' }
  }

  const toInsert = rows
    .filter(r => r.Email && r.Password)
    .map(r => ({
      email: r.Email.trim().toLowerCase(),
      password: r.Password.trim(),
      status: 'pending',
      uploaded_by: adminUser.id,
      upload_date: uploadDate,
    }))

  if (toInsert.length === 0) return { error: 'No valid rows found.' }

  const CHUNK = 500
  let inserted = 0
  let failed = 0
  for (let i = 0; i < toInsert.length; i += CHUNK) {
    const chunk = toInsert.slice(i, i + CHUNK)
    const { error, count } = await adminSupabase
      .from('email_credentials')
      .insert(chunk, { count: 'exact' })
    if (error) {
      console.error('Insert error:', error)
      failed += chunk.length
    } else {
      inserted += count ?? chunk.length
    }
  }

  revalidatePath('/admin/upload')
  revalidateCredentialViews()
  return { success: true, inserted, failed, total: toInsert.length, uploadDate }
}

// ============ ASSIGN ============
export async function assignCredentials(credentialIds, userId, date, uploadDate) {
  const adminUser = await requireAdmin()
  const adminSupabase = createAdminClient()

  if (!credentialIds?.length) return { error: 'No credentials selected.' }
  if (!userId || !date) return { error: 'User and date required.' }

  const CHUNK = 100
  const assignedAt = new Date().toISOString()
  let updated = 0
  for (let i = 0; i < credentialIds.length; i += CHUNK) {
    const chunk = credentialIds.slice(i, i + CHUNK)
    let updateQuery = adminSupabase
      .from('email_credentials')
      .update({
        assigned_to: userId,
        assign_date: date,
        assigned_at: assignedAt,
        assigned_by: adminUser.id,
      })
      .in('id', chunk)
      .is('assigned_to', null)
    if (uploadDate) updateQuery = updateQuery.eq('upload_date', uploadDate)
    const { error } = await updateQuery
    if (error) return { error: error.message }
    updated += chunk.length
  }

  revalidateCredentialViews()
  return { success: true, updated }
}

// ============ QUICK ASSIGN BY QUANTITY ============
export async function assignNextCredentials(userId, date, count, uploadDate) {
  const adminUser = await requireAdmin()
  const adminSupabase = createAdminClient()

  if (!userId || !date) return { error: 'User and date required.' }

  const requested = Number(count)
  if (!Number.isInteger(requested) || requested < 1) {
    return { error: 'Enter a valid number greater than 0.' }
  }

  // Hard cap keeps a single click from touching an unbounded number of rows.
  const limit = Math.min(requested, 500)

  let poolQuery = adminSupabase
    .from('email_credentials')
    .select('id')
    .is('assigned_to', null)
  if (uploadDate) poolQuery = poolQuery.eq('upload_date', uploadDate)
  const { data: pool, error: fetchError } = await poolQuery
    .order('created_at', { ascending: true })
    .limit(limit)

  if (fetchError) return { error: fetchError.message }
  if (!pool?.length) return { error: 'No unassigned credentials available for this upload date.' }

  const CHUNK = 100
  const assignedAt = new Date().toISOString()
  let updated = 0

  for (let i = 0; i < pool.length; i += CHUNK) {
    const ids = pool.slice(i, i + CHUNK).map(r => r.id)
    let updateQuery = adminSupabase
      .from('email_credentials')
      .update({
        assigned_to: userId,
        assign_date: date,
        assigned_at: assignedAt,
        assigned_by: adminUser.id,
      })
      .in('id', ids)
      .is('assigned_to', null)
    if (uploadDate) updateQuery = updateQuery.eq('upload_date', uploadDate)
    const { error } = await updateQuery
    if (error) return { error: error.message, updated }
    updated += ids.length
  }

  revalidateCredentialViews()
  return {
    success: true,
    updated,
    requested: limit,
    shortfall: Math.max(0, limit - updated),
  }
}

// ============ UNASSIGN ============
export async function unassignCredentials(credentialIds) {
  await requireAdmin()
  const adminSupabase = createAdminClient()

  if (!credentialIds?.length) return { error: 'No credentials selected.' }
  if (credentialIds.length > 50) {
    return { error: 'Max 50 per batch. Please split into smaller batches.' }
  }

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
    .in('id', credentialIds)

  if (error) return { error: error.message }

  revalidateCredentialViews()
  return { success: true }
}

// ============ ROLE MANAGEMENT ============
export async function updateUserRole(profileId, role) {
  const adminUser = await requireAdmin()
  const adminSupabase = createAdminClient()

  if (!profileId) return { error: 'Profile ID required.' }
  if (!ROLES.includes(role)) return { error: 'Invalid role.' }
  if (profileId === adminUser.id && role !== 'admin') {
    return { error: 'You cannot remove your own admin role.' }
  }

  const { error } = await adminSupabase
    .from('profiles')
    .update({ role })
    .eq('id', profileId)

  if (error) return { error: error.message }

  revalidatePath('/admin/users')
  return { success: true, role }
}

// ============ VERIFY ============
export async function verifyCredentials({ date, rows }) {
  const adminUser = await requireAdmin()
  const adminSupabase = createAdminClient()

  if (!date) return { error: 'Date required' }
  if (!rows?.length) return { error: 'No rows' }

  const normalized = rows
    .map(r => ({
      email: String(r.Email || '').trim().toLowerCase(),
      result: String(r.Result || '').trim().toLowerCase(),
    }))
    .filter(r => r.email && (r.result === 'done' || r.result === 'error'))

  if (normalized.length === 0) {
    return { error: 'No valid rows (Result must be "done" or "error").' }
  }

  const emails = normalized.map(r => r.email)
  const { data: creds, error } = await adminSupabase
    .from('email_credentials')
    .select('id, email')
    .eq('assign_date', date)
    .in('email', emails)

  if (error) return { error: error.message }

  const map = new Map()
  ;(creds || []).forEach(c => map.set(c.email.toLowerCase(), c.id))

  const now = new Date().toISOString()
  const notFound = []
  let updated = 0

  for (const r of normalized) {
    const id = map.get(r.email)
    if (!id) { notFound.push(r.email); continue }
    const { error: updErr } = await adminSupabase
      .from('email_credentials')
      .update({
        verified_status: r.result,
        verified_at: now,
        verified_by: adminUser.id,
      })
      .eq('id', id)
    if (!updErr) updated++
  }

  revalidatePath('/admin/verify')
  revalidateCredentialViews()

  return { success: true, total: normalized.length, updated, notFound }
}