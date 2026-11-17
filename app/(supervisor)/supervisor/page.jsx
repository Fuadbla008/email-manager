import Link from 'next/link'
import { connection } from 'next/server'
import { requireRole } from '@/lib/auth'
import { getSupervisorAssignedRows } from '@/lib/supabase/cached'
import CompletionBar from '@/components/completion-bar'
import { completionPct } from '@/lib/progress'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

function todayDhaka() {
  const now = new Date()
  const dhaka = new Date(now.getTime() + 6 * 60 * 60 * 1000)
  return dhaka.toISOString().slice(0, 10)
}

function emptyBucket(label) {
  return { label, total: 0, pending: 0, done: 0, error: 0, verifiedDone: 0, verifiedError: 0 }
}

function addToBucket(bucket, row) {
  bucket.total++
  if (bucket[row.status] !== undefined) bucket[row.status]++
  if (row.verified_status === 'done') bucket.verifiedDone++
  else if (row.verified_status === 'error') bucket.verifiedError++
}

function userBucket(row) {
  return {
    ...emptyBucket(row.assigned_profile?.full_name || row.assigned_profile?.email || 'Unknown user'),
    id: row.assigned_to,
  }
}

export default async function SupervisorDashboard({ searchParams }) {
  await connection()
  const params = await searchParams
  const { user } = await requireRole(['supervisor', 'admin'])
  const date = params?.date || todayDhaka()

  let rows = []
  let errorMessage = null
  try {
    rows = await getSupervisorAssignedRows(user.id)
  } catch (error) {
    errorMessage = error.message
  }

  // All-time totals and the date/user rollups the supervisor has assigned.
  const perDate = new Map()
  const perUser = new Map()
  const totals = emptyBucket('all')

  // The selected date only. Filtering in memory keeps this page to one query.
  const dayBucket = emptyBucket(date)
  const dayPerUser = new Map()

  ;(rows ?? []).forEach(row => {
    const dateKey = row.assign_date || 'No date'
    if (!perDate.has(dateKey)) perDate.set(dateKey, emptyBucket(dateKey))
    addToBucket(perDate.get(dateKey), row)

    const userKey = row.assigned_to || 'unassigned'
    if (!perUser.has(userKey)) perUser.set(userKey, userBucket(row))
    addToBucket(perUser.get(userKey), row)
    addToBucket(totals, row)

    if (row.assign_date === date) {
      addToBucket(dayBucket, row)
      if (!dayPerUser.has(userKey)) dayPerUser.set(userKey, userBucket(row))
      addToBucket(dayPerUser.get(userKey), row)
    }
  })

  const dateRows = Array.from(perDate.values()).sort((a, b) => String(b.label).localeCompare(String(a.label)))
  const userRows = Array.from(perUser.values()).sort((a, b) => b.total - a.total)
  const dayUsers = Array.from(dayPerUser.values()).sort((a, b) => b.total - a.total)
  const pct = completionPct(totals.done, totals.error, totals.total)
  const dayPct = completionPct(dayBucket.done, dayBucket.error, dayBucket.total)

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Supervisor Overview</h1>
          <p className="text-sm text-slate-500">
            Only credentials that you assigned appear here.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <form method="GET" className="flex items-center gap-2">
            <input
              type="date"
              name="date"
              defaultValue={date}
              className="rounded border bg-white px-3 py-2 text-sm"
            />
            <button
              type="submit"
              className="rounded bg-slate-900 px-3 py-2 text-sm text-white hover:bg-slate-800"
            >
              Show
            </button>
          </form>
          <Link href="/supervisor/assign" className={buttonVariants({ size: 'sm' })}>
            Assign Credentials
          </Link>
        </div>
      </div>

      {errorMessage && (
        <Card className="mb-4">
          <CardContent className="py-6 text-center text-red-600">{errorMessage}</CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3 mb-6 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Assigned by you</CardDescription>
            <CardTitle className="text-3xl">{totals.total}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Users</CardDescription>
            <CardTitle className="text-3xl">{userRows.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Done</CardDescription>
            <CardTitle className="text-3xl text-green-600">{totals.done}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Completion</CardDescription>
            <CardTitle className="text-3xl">{pct}%</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <CompletionBar
              done={totals.done}
              error={totals.error}
              total={totals.total}
              showLabel={false}
            />
          </CardContent>
        </Card>
      </div>

      <Card className="mb-4">
        <CardHeader className="pb-2">
          <CardTitle>Assignments on {date}</CardTitle>
          <CardDescription>Work due on the selected date</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-4">
            <div>
              <div className="text-xs text-slate-500">Total</div>
              <div className="text-2xl font-bold">{dayBucket.total}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Pending</div>
              <div className="text-2xl font-bold text-yellow-600">{dayBucket.pending}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Done</div>
              <div className="text-2xl font-bold text-green-600">{dayBucket.done}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Error</div>
              <div className="text-2xl font-bold text-red-600">{dayBucket.error}</div>
            </div>
          </div>
          <div className="mb-2 flex items-center justify-between gap-2 text-xs text-slate-500">
            <span>Completion</span>
            <span>{dayPct}% · {dayBucket.done + dayBucket.error} of {dayBucket.total} finished</span>
          </div>
          <CompletionBar done={dayBucket.done} error={dayBucket.error} total={dayBucket.total} />
        </CardContent>
      </Card>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Per User — {date}</CardTitle>
          <CardDescription>Your assignments for this date, grouped by user</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Done</TableHead>
                  <TableHead>Pending</TableHead>
                  <TableHead>Error</TableHead>
                  <TableHead className="w-40">Progress</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dayUsers.map(row => (
                  <TableRow key={row.id || row.label}>
                    <TableCell className="font-medium">{row.label}</TableCell>
                    <TableCell>{row.total}</TableCell>
                    <TableCell className="text-green-600">{row.done}</TableCell>
                    <TableCell className="text-yellow-600">{row.pending}</TableCell>
                    <TableCell className="text-red-600">{row.error}</TableCell>
                    <TableCell>
                      <CompletionBar done={row.done} error={row.error} total={row.total} />
                    </TableCell>
                  </TableRow>
                ))}
                {dayUsers.length === 0 && !errorMessage && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-slate-500">
                      Nothing assigned by you for {date}.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Per Date</CardTitle>
            <CardDescription>All assignment dates for your work · click a date to open it above</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Done</TableHead>
                    <TableHead>Pending</TableHead>
                    <TableHead>Error</TableHead>
                    <TableHead className="w-40">Progress</TableHead>
                    <TableHead>Verified</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dateRows.map(row => (
                    <TableRow key={row.label} className={row.label === date ? 'bg-blue-50' : ''}>
                      <TableCell className="font-medium whitespace-nowrap">
                        {row.label === 'No date' ? (
                          row.label
                        ) : (
                          <Link href={`/supervisor?date=${row.label}`} className="hover:underline">
                            {row.label}
                          </Link>
                        )}
                      </TableCell>
                      <TableCell>{row.total}</TableCell>
                      <TableCell className="text-green-600">{row.done}</TableCell>
                      <TableCell className="text-yellow-600">{row.pending}</TableCell>
                      <TableCell className="text-red-600">{row.error}</TableCell>
                      <TableCell>
                        <CompletionBar done={row.done} error={row.error} total={row.total} />
                      </TableCell>
                      <TableCell>{row.verifiedDone + row.verifiedError}</TableCell>
                    </TableRow>
                  ))}
                  {dateRows.length === 0 && !errorMessage && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-slate-500">
                        No assignment dates yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Per User (all-time)</CardTitle>
            <CardDescription>Everyone you have assigned credentials to</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Done</TableHead>
                    <TableHead>Pending</TableHead>
                    <TableHead>Error</TableHead>
                    <TableHead className="w-40">Progress</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {userRows.map(row => (
                    <TableRow key={row.id || row.label}>
                      <TableCell className="font-medium">{row.label}</TableCell>
                      <TableCell>{row.total}</TableCell>
                      <TableCell className="text-green-600">{row.done}</TableCell>
                      <TableCell className="text-yellow-600">{row.pending}</TableCell>
                      <TableCell className="text-red-600">{row.error}</TableCell>
                      <TableCell>
                        <CompletionBar done={row.done} error={row.error} total={row.total} />
                      </TableCell>
                    </TableRow>
                  ))}
                  {userRows.length === 0 && !errorMessage && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-slate-500">
                        You have not assigned any credentials yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-4">
        <Link href="/supervisor/reports" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
          Open Full Reports
        </Link>
      </div>
    </div>
  )
}
