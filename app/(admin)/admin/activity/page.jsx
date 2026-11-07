import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'

// This route reads searchParams + live DB data; opt out of instant validation.
export const instant = false

const PAGE_SIZE = 50

function formatDhaka(value) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Dhaka',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(value))
}

function statusClass(status) {
  if (status === 'done') return 'bg-green-100 text-green-800 border-green-200'
  if (status === 'error') return 'bg-red-100 text-red-800 border-red-200'
  return 'bg-yellow-100 text-yellow-800 border-yellow-200'
}

function activityHref({ user, status, page }) {
  const params = new URLSearchParams()
  if (user && user !== 'all') params.set('user', user)
  if (status && status !== 'all') params.set('status', status)
  if (page > 0) params.set('page', String(page))
  const query = params.toString()
  return query ? `/admin/activity?${query}` : '/admin/activity'
}

export default async function ActivityPage({ searchParams }) {
  const params = await searchParams
  const page = Math.max(0, Number.parseInt(params?.page ?? '0', 10) || 0)
  const userFilter = params?.user ?? 'all'
  const statusFilter = params?.status ?? 'all'
  const supabase = await createClient()

  let logsQuery = supabase
    .from('activity_logs')
    .select(
      'id, old_status, new_status, created_at, user_id, credential_id, profiles!user_id(full_name, email), email_credentials!credential_id(email)',
      { count: 'exact' }
    )

  if (userFilter !== 'all') logsQuery = logsQuery.eq('user_id', userFilter)
  if (statusFilter !== 'all') logsQuery = logsQuery.eq('new_status', statusFilter)

  const [
    { data: logs, count, error },
    { data: users },
  ] = await Promise.all([
    logsQuery
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1),
    supabase
      .from('profiles')
      .select('id, full_name, email')
      .order('full_name', { ascending: true }),
  ])

  const total = count ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const hasFilters = userFilter !== 'all' || statusFilter !== 'all'

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Activity Log</h1>
          <p className="text-sm text-slate-500">Every user status change, newest first (Asia/Dhaka time).</p>
        </div>
        <Link href="/admin/activity" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
          Refresh
        </Link>
      </div>

      <Card className="mb-4">
        <CardContent className="pt-4">
          <form method="GET" className="flex gap-3 items-end flex-wrap">
            <div>
              <label className="text-sm font-medium" htmlFor="activity-user">User</label>
              <select
                id="activity-user"
                name="user"
                defaultValue={userFilter}
                className="block mt-1 border rounded px-3 py-2 text-sm bg-white min-w-48"
              >
                <option value="all">All Users</option>
                {(users ?? []).map(u => (
                  <option key={u.id} value={u.id}>{u.full_name || u.email}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium" htmlFor="activity-status">New status</label>
              <select
                id="activity-status"
                name="status"
                defaultValue={statusFilter}
                className="block mt-1 border rounded px-3 py-2 text-sm bg-white min-w-40"
              >
                <option value="all">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="done">Done</option>
                <option value="error">Error</option>
              </select>
            </div>
            <button
              type="submit"
              className="px-3 py-2 text-sm bg-slate-900 text-white rounded hover:bg-slate-800"
            >
              Filter
            </button>
            {hasFilters && (
              <Link
                href="/admin/activity"
                className={buttonVariants({ variant: 'outline', size: 'sm' })}
              >
                Clear
              </Link>
            )}
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>History</CardTitle>
          <CardDescription>{total} recorded change(s)</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Credential</TableHead>
                  <TableHead>Change</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {error && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-red-600">
                      {error.message}
                    </TableCell>
                  </TableRow>
                )}
                {(logs ?? []).map(log => (
                  <TableRow key={log.id}>
                    <TableCell className="text-sm whitespace-nowrap">{formatDhaka(log.created_at)}</TableCell>
                    <TableCell>
                      <div className="font-medium">
                        {log.profiles?.full_name || log.profiles?.email || 'Unknown user'}
                      </div>
                      {log.profiles?.full_name && (
                        <div className="text-xs text-slate-500">{log.profiles.email}</div>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {log.email_credentials?.email || log.credential_id}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className={statusClass(log.old_status)}>
                          {log.old_status || '—'}
                        </Badge>
                        <span className="text-slate-400">→</span>
                        <Badge variant="outline" className={statusClass(log.new_status)}>
                          {log.new_status}
                        </Badge>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {!error && logs?.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-slate-500">
                      No activity found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-wrap gap-2 items-center justify-between p-4 border-t">
            <div className="text-sm text-slate-500">
              {total === 0
                ? '0 results'
                : `Showing ${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, total)} of ${total}`}
            </div>
            <div className="flex items-center gap-2">
              <Link
                href={activityHref({ user: userFilter, status: statusFilter, page: Math.max(0, page - 1) })}
                aria-disabled={page === 0}
                className={buttonVariants({
                  variant: 'outline',
                  size: 'sm',
                  className: page === 0 ? 'pointer-events-none opacity-50' : '',
                })}
              >
                Prev
              </Link>
              <span className="text-sm">Page {page + 1} / {totalPages}</span>
              <Link
                href={activityHref({ user: userFilter, status: statusFilter, page: Math.min(totalPages - 1, page + 1) })}
                aria-disabled={page + 1 >= totalPages}
                className={buttonVariants({
                  variant: 'outline',
                  size: 'sm',
                  className: page + 1 >= totalPages ? 'pointer-events-none opacity-50' : '',
                })}
              >
                Next
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
