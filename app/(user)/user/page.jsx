import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import TasksView from './tasks-view'

export default async function UserTasksPage({ searchParams }) {
  const params = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, email')
    .eq('id', user.id)
    .single()

  const { data: dateRows } = await supabase
    .from('email_credentials')
    .select('assign_date')
    .eq('assigned_to', user.id)
    .not('assign_date', 'is', null)

  const dates = Array.from(new Set((dateRows ?? []).map(r => r.assign_date)))
    .sort()
    .reverse()

  const requestedDate = params?.date
  const selectedDate = dates.includes(requestedDate) ? requestedDate : (dates[0] ?? null)

  let initialRows = []
  if (selectedDate) {
    const { data } = await supabase
      .from('email_credentials')
      .select('id, email, password, status, verified_status, completed_at')
      .eq('assigned_to', user.id)
      .eq('assign_date', selectedDate)
      .order('created_at', { ascending: true })
    initialRows = data ?? []
  }

  return (
    <TasksView
      userEmail={profile?.email || user.email}
      dates={dates}
      initialDate={selectedDate}
      initialRows={initialRows}
    />
  )
}