'use server'

import { after } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { updateTag } from 'next/cache'
import { CREDENTIAL_CACHE_TAG } from '@/lib/supabase/cached'

const STATUSES = new Set(['pending', 'done', 'error'])
const MAX_UPDATES = 500
// `.in()` puts the ids in the query string; keep each request well under the
// gateway URL limit (the rest of the app also caps assign/unassign batches).
const ID_CHUNK = 100

function chunk(list, size) {
  const out = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

function normalizeUpdate(raw) {
  if (!raw || !raw.id || !STATUSES.has(raw.status)) return null
  const isError = raw.status === 'error'
  return {
    id: raw.id,
    status: raw.status,
    // Error flags only exist while the row is an error.
    error_number_verify: isError ? !!raw.error_number_verify : false,
    error_locked: isError ? !!raw.error_locked : false,
  }
}

/**
 * Apply a batch of per-row status changes.
 *
 * The client keeps changes in a localStorage queue and sends them here in the
 * background. Rows are grouped by their exact payload so one SQL update can
 * cover many rows, and retries are idempotent (a row already in the requested
 * state is confirmed without another write or audit log).
 */
export async function updateStatus(updates) {
  const list = (Array.isArray(updates) ? updates : [updates])
    .map(normalizeUpdate)
    .filter(Boolean)
    .slice(0, MAX_UPDATES)

  if (list.length === 0) {
    return { error: 'No valid status updates', updatedIds: [], failedIds: [], skippedIds: [] }
  }

  // One queue entry per row, last write wins.
  const byId = new Map()
  list.forEach(update => byId.set(update.id, update))
  const deduped = Array.from(byId.values())
  const ids = deduped.map(update => update.id)

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated', updatedIds: [], failedIds: [], skippedIds: [] }

  // Ownership is checked with the user-scoped client first; the actual write
  // then uses the service-role client so RLS cannot silently drop it.
  const owned = []
  for (const part of chunk(ids, ID_CHUNK)) {
    const { data, error: fetchErr } = await supabase
      .from('email_credentials')
      .select('id, status, error_number_verify, error_locked')
      .in('id', part)
      .eq('assigned_to', user.id)

    if (fetchErr) {
      return { error: fetchErr.message, updatedIds: [], failedIds: [], skippedIds: [] }
    }
    if (data) owned.push(...data)
  }
  if (owned.length === 0) {
    return { error: 'No valid items found', updatedIds: [], failedIds: [], skippedIds: ids }
  }

  const ownedById = new Map(owned.map(row => [row.id, row]))
  const valid = []
  const skippedIds = []

  deduped.forEach(update => {
    if (ownedById.has(update.id)) valid.push(update)
    else skippedIds.push(update.id)
  })

  // Rows that are already in the requested state only need confirmation. This
  // is what makes a retried offline write cheap and duplicate-log free.
  const confirmedIds = []
  const toWrite = []
  valid.forEach(update => {
    const before = ownedById.get(update.id)
    const statusChanged = before.status !== update.status
    const flagsChanged =
      !!before.error_number_verify !== update.error_number_verify ||
      !!before.error_locked !== update.error_locked
    if (!statusChanged && !flagsChanged) confirmedIds.push(update.id)
    else toWrite.push({ ...update, statusChanged })
  })

  // Group by payload + whether completed_at must move. Flag-only edits keep the
  // original completion timestamp.
  const groups = new Map()
  toWrite.forEach(update => {
    const key = [
      update.status,
      update.error_number_verify ? 1 : 0,
      update.error_locked ? 1 : 0,
      update.statusChanged ? 1 : 0,
    ].join('|')
    if (!groups.has(key)) groups.set(key, { ...update, ids: [] })
    groups.get(key).ids.push(update.id)
  })

  const admin = createAdminClient()
  const now = new Date().toISOString()
  const writtenIds = []
  const failedIds = []
  let firstError = null

  for (const group of groups.values()) {
    const payload = group.statusChanged
      ? {
          status: group.status,
          completed_at: group.status === 'pending' ? null : now,
          error_number_verify: group.error_number_verify,
          error_locked: group.error_locked,
        }
      : {
          error_number_verify: group.error_number_verify,
          error_locked: group.error_locked,
        }

    for (const part of chunk(group.ids, ID_CHUNK)) {
      const { error: updateErr } = await admin
        .from('email_credentials')
        .update(payload)
        .in('id', part)

      if (updateErr) {
        if (!firstError) firstError = updateErr.message
        failedIds.push(...part)
      } else {
        writtenIds.push(...part)
      }
    }
  }

  const writtenSet = new Set(writtenIds)
  const logs = []
  valid.forEach(update => {
    if (!writtenSet.has(update.id)) return
    const before = ownedById.get(update.id)
    if (before.status === update.status) return
    logs.push({
      user_id: user.id,
      credential_id: update.id,
      old_status: before.status,
      new_status: update.status,
    })
  })

  // The audit log must not delay the response; `after` runs once it is sent.
  if (logs.length > 0) {
    after(async () => {
      const { error: logErr } = await admin.from('activity_logs').insert(logs)
      if (logErr) console.error('activity_logs insert failed:', logErr.message)
    })
  }

  // Supervisor overview/reports read through this tag. Everything else in the
  // app is request-time data, so per-path revalidation would only add latency.
  updateTag(CREDENTIAL_CACHE_TAG)

  const updatedIds = [...confirmedIds, ...writtenIds]
  return {
    success: failedIds.length === 0,
    updated: updatedIds.length,
    updatedIds,
    failedIds,
    skippedIds,
    error: firstError,
  }
}
