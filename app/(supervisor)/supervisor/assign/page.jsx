import { connection } from 'next/server'
import { requireRole } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import SupervisorAssignView from './assign-view'

function todayDhaka() {
  const now = new Date()
  const dhaka = new Date(now.getTime() + 6 * 60 * 60 * 1000)
  return dhaka.toISOString().slice(0, 10)
}

export default async function SupervisorAssignPage({ searchParams }) {
  await connection()
  const params = await searchParams
  const { user } = await requireRole(['supervisor', 'admin'])
  const admin = createAdminClient()

  const today = todayDhaka()
  const uploadDate = params?.upload || today

  const [
    { data: users },
    { data: pool },
    { count: remaining },
    { data: dateRows },
    { data: pendingRows },
  ] = await Promise.all([
    admin
      .from('profiles')
      .select('id, full_name, email')
      .eq('role', 'user')
      .order('full_name', { ascending: true }),
    admin
      .from('email_credentials')
      .select('id, email, upload_date')
      .is('assigned_to', null)
      .eq('upload_date', uploadDate)
      .order('created_at', { ascending: false })
      .limit(500),
    admin
      .from('email_credentials')
      .select('id', { count: 'exact', head: true })
      .is('assigned_to', null)
      .eq('upload_date', uploadDate),
    admin
      .from('email_credentials')
      .select('upload_date')
      .is('assigned_to', null)
      .not('upload_date', 'is', null)
      .order('upload_date', { ascending: false })
      .limit(5000),
    admin
      .from('email_credentials')
      .select(
        'id, email, assign_date, upload_date, assigned_to, assigned_profile:profiles!assigned_to(full_name, email)'
      )
      .eq('assigned_by', user.id)
      .eq('status', 'pending')
      .not('assigned_to', 'is', null)
      .order('assign_date', { ascending: false })
      .limit(500),
  ])

  const availableDates = Array.from(
    new Set([today, ...(dateRows ?? []).map(r => r.upload_date)])
  ).sort().reverse()

  return (
    <SupervisorAssignView
      key={uploadDate}
      users={users ?? []}
      pool={pool ?? []}
      pendingRows={pendingRows ?? []}
      uploadDate={uploadDate}
      assignDate={uploadDate}
      availableDates={availableDates}
      remaining={remaining ?? 0}
    />
  )
}
