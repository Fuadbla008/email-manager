import { connection } from 'next/server'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import RoleSelect from './role-select'

function todayDhaka() {
  const now = new Date()
  const dhaka = new Date(now.getTime() + 6 * 60 * 60 * 1000)
  return dhaka.toISOString().slice(0, 10)
}

export default async function AdminUsersPage() {
  await connection()
  const supabase = await createClient()
  const today = todayDhaka()
  const { data: { user: currentUser } } = await supabase.auth.getUser()

  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, full_name, email, role, created_at')
    .order('created_at', { ascending: true })

  if (error) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-red-600">{error.message}</CardContent>
      </Card>
    )
  }

  const users = await Promise.all((profiles ?? []).map(async (profile) => {
    const [totalRes, doneRes, errorRes, todayRes] = await Promise.all([
      supabase.from('email_credentials').select('id', { count: 'exact', head: true }).eq('assigned_to', profile.id),
      supabase.from('email_credentials').select('id', { count: 'exact', head: true }).eq('assigned_to', profile.id).eq('status', 'done'),
      supabase.from('email_credentials').select('id', { count: 'exact', head: true }).eq('assigned_to', profile.id).eq('status', 'error'),
      supabase.from('email_credentials').select('id', { count: 'exact', head: true }).eq('assigned_to', profile.id).eq('assign_date', today),
    ])

    const total = totalRes.count ?? 0
    const done = doneRes.count ?? 0
    const errorCount = errorRes.count ?? 0

    return {
      ...profile,
      total,
      done,
      error: errorCount,
      pending: Math.max(0, total - done - errorCount),
      today: todayRes.count ?? 0,
      pct: total > 0 ? Math.round((done / total) * 100) : 0,
    }
  }))

  const roleOrder = { user: 0, supervisor: 1, admin: 2 }
  const ordered = [...users].sort((a, b) => {
    if (a.role !== b.role) return (roleOrder[a.role] ?? 9) - (roleOrder[b.role] ?? 9)
    return (a.full_name || a.email || '').localeCompare(b.full_name || b.email || '')
  })
  const userRows = ordered.filter(u => u.role === 'user')
  const totals = userRows.reduce((acc, u) => ({
    total: acc.total + u.total,
    done: acc.done + u.done,
    pending: acc.pending + u.pending,
    error: acc.error + u.error,
  }), { total: 0, done: 0, pending: 0, error: 0 })
  const overallPct = totals.total > 0 ? Math.round((totals.done / totals.total) * 100) : 0

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Users &amp; Workload</h1>
          <p className="text-sm text-slate-500">Assignment totals as of {today} (Asia/Dhaka)</p>
        </div>
        <Link href="/admin/assign" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
          Open Assign Page
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Teammates</CardDescription>
            <CardTitle className="text-3xl">{userRows.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Assigned (all-time)</CardDescription>
            <CardTitle className="text-3xl">{totals.total}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Done (all-time)</CardDescription>
            <CardTitle className="text-3xl text-green-600">{totals.done}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Overall completion</CardDescription>
            <CardTitle className="text-3xl">{overallPct}%</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Profiles</CardTitle>
          <CardDescription>
            Change a member&apos;s role to <strong>supervisor</strong> if they should assign
            unassigned credentials and see their own team&apos;s reports. Click Assign to preselect a user.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Today</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Pending</TableHead>
                  <TableHead>Done</TableHead>
                  <TableHead>Error</TableHead>
                  <TableHead className="w-40">Progress</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ordered.map(u => (
                  <TableRow key={u.id}>
                    <TableCell>
                      <div className="font-medium">{u.full_name || u.email}</div>
                      {u.full_name && <div className="text-xs text-slate-500">{u.email}</div>}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className={u.role === 'admin'
                            ? 'bg-slate-100 text-slate-700 border-slate-200'
                            : u.role === 'supervisor'
                              ? 'bg-purple-100 text-purple-800 border-purple-200'
                              : 'bg-blue-100 text-blue-800 border-blue-200'}
                        >
                          {u.role}
                        </Badge>
                        <RoleSelect
                          profileId={u.id}
                          role={u.role}
                          canEdit={u.id !== currentUser?.id}
                        />
                      </div>
                    </TableCell>
                    <TableCell>{u.today}</TableCell>
                    <TableCell>{u.total}</TableCell>
                    <TableCell className="text-yellow-600">{u.pending}</TableCell>
                    <TableCell className="text-green-600">{u.done}</TableCell>
                    <TableCell className="text-red-600">{u.error}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-slate-200 rounded">
                          <div className="h-2 bg-green-500 rounded" style={{ width: `${u.pct}%` }} />
                        </div>
                        <span className="text-xs text-slate-500">{u.pct}%</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {u.role === 'user' ? (
                        <Link
                          href={`/admin/assign?user=${u.id}`}
                          className={buttonVariants({ variant: 'outline', size: 'sm' })}
                        >
                          Assign
                        </Link>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {ordered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-slate-500">
                      No profiles found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
