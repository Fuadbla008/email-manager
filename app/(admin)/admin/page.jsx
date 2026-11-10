import { connection } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { fetchAllRows } from '@/lib/supabase/fetch-all'
import CompletionBar from '@/components/completion-bar'
import { Card, CardHeader, CardDescription, CardTitle, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

function todayDhaka() {
  const now = new Date()
  const dhaka = new Date(now.getTime() + 6 * 60 * 60 * 1000)
  return dhaka.toISOString().slice(0, 10)
}

export default async function AdminDashboard({ searchParams }) {
  await connection()
  const params = await searchParams
  const supabase = await createClient()
  const date = params?.date || todayDhaka()

  const [
    { count: userCount },
    { count: credCount },
    { count: assignedCount },
    { data: allUsers },
  ] = await Promise.all([
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'user'),
    supabase.from('email_credentials').select('*', { count: 'exact', head: true }),
    supabase.from('email_credentials').select('*', { count: 'exact', head: true }).not('assigned_to', 'is', null),
    supabase.from('profiles').select('id, full_name, email').eq('role', 'user'),
  ])

  // Supabase/PostgREST returns at most 1000 rows per request, so an aggregate
  // over a single `.select()` silently loses rows once a date has more than
  // that. Page through every row and order by `id` so pages never overlap.
  let todayRows = []
  let rowsError = null
  try {
    todayRows = await fetchAllRows(() =>
      supabase
        .from('email_credentials')
        .select('id, status, assigned_to')
        .eq('assign_date', date)
        .order('id', { ascending: true })
    )
  } catch (error) {
    rowsError = error.message
  }

  // Overall counts for selected date
  const counts = { total: 0, pending: 0, done: 0, error: 0 }
  ;(todayRows ?? []).forEach(r => {
    counts.total++
    if (counts[r.status] !== undefined) counts[r.status]++
  })

  // Per-user breakdown
  const perUser = new Map()
  ;(allUsers ?? []).forEach(u => {
    perUser.set(u.id, {
      id: u.id,
      name: u.full_name || u.email,
      total: 0, done: 0, pending: 0, error: 0,
    })
  })
  ;(todayRows ?? []).forEach(r => {
    if (!r.assigned_to) return
    const row = perUser.get(r.assigned_to)
    if (!row) return
    row.total++
    if (row[r.status] !== undefined) row[r.status]++
  })
  const userStats = Array.from(perUser.values())
    .filter(u => u.total > 0)
    .sort((a, b) => b.total - a.total)

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Admin Dashboard</h1>
          <p className="text-sm text-slate-500">Date: {date}</p>
        </div>
        <form method="GET" className="flex gap-2 items-center">
          <input
            type="date"
            name="date"
            defaultValue={date}
            className="border rounded px-3 py-2 text-sm bg-white"
          />
          <button
            type="submit"
            className="px-3 py-2 text-sm bg-slate-900 text-white rounded hover:bg-slate-800"
          >
            Show
          </button>
        </form>
      </div>

      {rowsError && (
        <Card className="mb-6">
          <CardContent className="py-6 text-center text-red-600">
            Could not load counts: {rowsError}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Users</CardDescription>
            <CardTitle className="text-3xl">{userCount ?? 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Credentials</CardDescription>
            <CardTitle className="text-3xl">{credCount ?? 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Assigned (all-time)</CardDescription>
            <CardTitle className="text-3xl">{assignedCount ?? 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Unassigned Pool</CardDescription>
            <CardTitle className="text-3xl text-slate-500">
              {(credCount ?? 0) - (assignedCount ?? 0)}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Overall Progress on {date}</CardTitle>
          <CardDescription>Across all users</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <div className="text-xs text-slate-500">Total</div>
              <div className="text-2xl font-bold">{counts.total}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Done</div>
              <div className="text-2xl font-bold text-green-600">{counts.done}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Pending</div>
              <div className="text-2xl font-bold text-yellow-600">{counts.pending}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Error</div>
              <div className="text-2xl font-bold text-red-600">{counts.error}</div>
            </div>
          </div>
          <div className="mt-4">
            <CompletionBar done={counts.done} error={counts.error} total={counts.total} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Per-User Progress — {date}</CardTitle>
          <CardDescription>Only users with assignments on this date</CardDescription>
        </CardHeader>
        <CardContent className="p-0 overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead className="w-40">Progress</TableHead>
                <TableHead>Assigned</TableHead>
                <TableHead>Done</TableHead>
                <TableHead>Pending</TableHead>
                <TableHead>Error</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {userStats.map(u => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.name}</TableCell>
                  <TableCell>
                    <CompletionBar done={u.done} error={u.error} total={u.total} />
                  </TableCell>
                  <TableCell>{u.total}</TableCell>
                  <TableCell className="text-green-600">{u.done}</TableCell>
                  <TableCell className="text-yellow-600">{u.pending}</TableCell>
                  <TableCell className="text-red-600">{u.error}</TableCell>
                </TableRow>
              ))}
              {userStats.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-6 text-slate-500">
                    No assignments on {date}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}