'use server'

import { requireRole } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { fetchAllRows } from '@/lib/supabase/fetch-all'
import { safeFilename, toCsv } from '@/lib/csv'

const DETAIL_COLUMNS = [
  { key: 'email', label: 'Email' },
  { key: 'password', label: 'Password' },
  { key: 'status', label: 'Status' },
  { key: 'verified_status', label: 'Verified Status' },
  { key: 'assign_date', label: 'Assign Date' },
  { key: 'upload_date', label: 'Upload Date' },
  { key: 'user', label: 'User' },
]

function detailRow(row) {
  return {
    email: row.email,
    password: row.password,
    status: row.status,
    verified_status: row.verified_status ?? '',
    assign_date: row.assign_date ?? '',
    upload_date: row.upload_date ?? '',
    user: row.assigned_profile?.full_name || row.assigned_profile?.email || '',
  }
}

function dateLabel(date, from, to) {
  if (date) return date
  if (from && to) return `${from}_to_${to}`
  if (from) return `from_${from}`
  if (to) return `to_${to}`
  return 'all_dates'
}

function createDetailQuery(admin, filters, assignedBy = null) {
  const { userId = 'all', date = '', from = '', to = '' } = filters ?? {}

  let query = admin
    .from('email_credentials')
    .select(
      'email, password, status, verified_status, assign_date, upload_date, assigned_to, assigned_profile:profiles!assigned_to(full_name, email)'
    )

  if (assignedBy) query = query.eq('assigned_by', assignedBy)
  if (userId && userId !== 'all') query = query.eq('assigned_to', userId)

  if (date) {
    query = query.eq('assign_date', date)
  } else {
    if (from) query = query.gte('assign_date', from)
    if (to) query = query.lte('assign_date', to)
  }

  // `id` is the tiebreaker so pagination never duplicates or skips rows.
  return query
    .order('assign_date', { ascending: true })
    .order('email', { ascending: true })
    .order('id', { ascending: true })
}

async function buildCsv(admin, filters, assignedBy, filenamePrefix) {
  const rows = await fetchAllRows(
    () => createDetailQuery(admin, filters, assignedBy),
    { pageSize: 1000 }
  )

  if (rows.length === 0) {
    return { error: 'No credentials found for the selected filters.' }
  }

  const { date = '', from = '', to = '' } = filters ?? {}
  const filename = `${filenamePrefix}_${dateLabel(date, from, to)}_${new Date()
    .toISOString()
    .slice(0, 10)}.csv`

  return {
    csv: toCsv(DETAIL_COLUMNS, rows.map(detailRow)),
    count: rows.length,
    filename: safeFilename(filename, 'credentials.csv'),
  }
}

/** Admin: email/password/status CSV for one user + date range (or one date). */
export async function exportAdminCredentials(filters) {
  await requireRole(['admin'])
  const admin = createAdminClient()
  return buildCsv(admin, filters, null, 'credentials')
}

/** Supervisor: only rows this supervisor assigned, optionally for one user/date range. */
export async function exportSupervisorCredentials(filters) {
  const { user } = await requireRole(['supervisor', 'admin'])
  const admin = createAdminClient()
  return buildCsv(admin, filters, user.id, 'supervisor_credentials')
}
