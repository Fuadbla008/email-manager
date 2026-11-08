import Link from 'next/link'
import { connection } from 'next/server'
import { requireRole } from '@/lib/auth'
import { getSupervisorAssignedRows } from '@/lib/supabase/cached'
import CompletionBar from '@/components/completion-bar'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import ExportSupervisorButton from './export-button'

function emptyBucket() {
  return {
    total: 0,
    done: 0,
    pending: 0,
    error: 0,
    verifiedDone: 0,
    verifiedError: 0,
    notVerified: 0,
    match: 0,
    mismatch: 0,
  }
}

function addRow(bucket, row) {
  bucket.total++
  if (bucket[row.status] !== undefined) bucket[row.status]++
  if (row.verified_status === 'done') bucket.verifiedDone++
  else if (row.verified_status === 'error') bucket.verifiedError++
  else bucket.notVerified++
  if (row.verified_status) {
    if (row.status === row.verified_status) bucket.match++
    else bucket.mismatch++
  }
}

export default async function SupervisorReportsPage({ searchParams }) {
  await connection()
  const params = await searchParams
  const { user } = await requireRole(['supervisor', 'admin'])

  const userFilter = params?.user || 'all'
  const fromDate = params?.from || ''
  const toDate = params?.to || ''

  let rows = []
  let errorMessage = null
  try {
    rows = await getSupervisorAssignedRows(user.id)
  } catch (error) {
    errorMessage = error.message
  }

  const filtered = (rows ?? []).filter(row => {
    if (userFilter !== 'all' && row.assigned_to !== userFilter) return false
    if (fromDate && (!row.assign_date || row.assign_date < fromDate)) return false
    if (toDate && (!row.assign_date || row.assign_date > toDate)) return false
    return true
  })

  const userOptions = new Map()
  ;(rows ?? []).forEach(row => {
    if (!row.assigned_to) return
    userOptions.set(
      row.assigned_to,
      row.assigned_profile?.full_name || row.assigned_profile?.email || 'Unknown user'
    )
  })

  const perUser = new Map()
  const perDate = new Map()
  const perDateUser = new Map()
  const totals = emptyBucket()

  filtered.forEach(row => {
    const userName = row.assigned_profile?.full_name || row.assigned_profile?.email || 'Unknown user'

    if (!perUser.has(row.assigned_to)) {
      perUser.set(row.assigned_to, { id: row.assigned_to, name: userName, ...emptyBucket() })
    }
    addRow(perUser.get(row.assigned_to), row)

    const dateKey = row.assign_date || 'No date'
    if (!perDate.has(dateKey)) perDate.set(dateKey, { label: dateKey, ...emptyBucket() })
    addRow(perDate.get(dateKey), row)

    const detailKey = `${dateKey}|${row.assigned_to}`
    if (!perDateUser.has(detailKey)) {
      perDateUser.set(detailKey, { date: dateKey, user: userName, ...emptyBucket() })
    }
    addRow(perDateUser.get(detailKey), row)

    addRow(totals, row)
  })

  const userRows = Array.from(perUser.values()).sort((a, b) => b.total - a.total)
  const dateRows = Array.from(perDate.values()).sort((a, b) => String(b.label).localeCompare(String(a.label)))
  const detailRows = Array.from(perDateUser.values())
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || a.user.localeCompare(b.user))

  const hasFilters = userFilter !== 'all' || fromDate || toDate
  const matchPct = (totals.match + totals.mismatch) > 0
    ? Math.round((totals.match / (totals.match + totals.mismatch)) * 100)
    : 0

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Supervisor Reports</h1>
          <p className="text-sm text-slate-500">
            Claim vs. verified results for the users you assigned.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <ExportSupervisorButton userId={userFilter} from={fromDate} to={toDate} />
          <Link href="/supervisor/assign" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
            Assign More
          </Link>
        </div>
      </div>

      <Card className="mb-4">
        <CardContent className="pt-4">
          <form method="GET" className="flex gap-3 items-end flex-wrap">
            <div>
              <label className="text-sm font-medium" htmlFor="report-user">User</label>
              <select
                id="report-user"
                name="user"
                defaultValue={userFilter}
                className="block mt-1 border rounded px-3 py-2 text-sm bg-white min-w-48"
              >
                <option value="all">All Users</option>
                {Array.from(userOptions.entries()).map(([id, name]) => (
                  <option key={id} value={id}>{name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium" htmlFor="report-from">From</label>
              <input
                id="report-from"
                type="date"
                name="from"
                defaultValue={fromDate}
                className="block mt-1 border rounded px-3 py-2 text-sm bg-white"
              />
            </div>
            <div>
              <label className="text-sm font-medium" htmlFor="report-to">To</label>
              <input
                id="report-to"
                type="date"
                name="to"
                defaultValue={toDate}
                className="block mt-1 border rounded px-3 py-2 text-sm bg-white"
              />
            </div>
            <button
              type="submit"
              className="px-3 py-2 text-sm bg-slate-900 text-white rounded hover:bg-slate-800"
            >
              Apply
            </button>
            {hasFilters && (
              <Link href="/supervisor/reports" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
                Clear
              </Link>
            )}
          </form>
        </CardContent>
      </Card>

      {errorMessage && (
        <Card className="mb-4">
          <CardContent className="py-6 text-center text-red-600">{errorMessage}</CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Assigned (filtered)</CardDescription>
            <CardTitle className="text-3xl">{totals.total}</CardTitle>
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
            <CardDescription>Mismatches</CardDescription>
            <CardTitle className="text-3xl text-orange-600">{totals.mismatch}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Verified match rate</CardDescription>
            <CardTitle className="text-3xl">{matchPct}%</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Per User</CardTitle>
          <CardDescription>Summary for each user you assigned</CardDescription>
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
                  <TableHead>Verified ✓</TableHead>
                  <TableHead>Verified ✗</TableHead>
                  <TableHead>Not Verified</TableHead>
                  <TableHead>Match</TableHead>
                  <TableHead>Mismatch</TableHead>
                  <TableHead className="w-40">Progress</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {userRows.map(row => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">
                      <Link href={`/supervisor/reports?user=${row.id}`} className="hover:underline">
                        {row.name}
                      </Link>
                    </TableCell>
                    <TableCell>{row.total}</TableCell>
                    <TableCell className="text-green-600">{row.done}</TableCell>
                    <TableCell className="text-yellow-600">{row.pending}</TableCell>
                    <TableCell className="text-red-600">{row.error}</TableCell>
                    <TableCell>{row.verifiedDone}</TableCell>
                    <TableCell>{row.verifiedError}</TableCell>
                    <TableCell>{row.notVerified}</TableCell>
                    <TableCell className="text-green-600">{row.match}</TableCell>
                    <TableCell className="text-orange-600 font-bold">{row.mismatch}</TableCell>
                    <TableCell>
                      <CompletionBar done={row.done} error={row.error} total={row.total} />
                    </TableCell>
                  </TableRow>
                ))}
                {userRows.length === 0 && !errorMessage && (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center py-8 text-slate-500">
                      No users match this report.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Per Date</CardTitle>
          <CardDescription>Assignment date totals</CardDescription>
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
                  <TableHead>Verified ✓</TableHead>
                  <TableHead>Verified ✗</TableHead>
                  <TableHead>Match</TableHead>
                  <TableHead>Mismatch</TableHead>
                  <TableHead className="w-40">Progress</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dateRows.map(row => (
                  <TableRow key={row.label}>
                    <TableCell className="font-medium whitespace-nowrap">{row.label}</TableCell>
                    <TableCell>{row.total}</TableCell>
                    <TableCell className="text-green-600">{row.done}</TableCell>
                    <TableCell className="text-yellow-600">{row.pending}</TableCell>
                    <TableCell className="text-red-600">{row.error}</TableCell>
                    <TableCell>{row.verifiedDone}</TableCell>
                    <TableCell>{row.verifiedError}</TableCell>
                    <TableCell className="text-green-600">{row.match}</TableCell>
                    <TableCell className="text-orange-600 font-bold">{row.mismatch}</TableCell>
                    <TableCell>
                      <CompletionBar done={row.done} error={row.error} total={row.total} />
                    </TableCell>
                  </TableRow>
                ))}
                {dateRows.length === 0 && !errorMessage && (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-8 text-slate-500">
                      No dates match this report.
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
          <CardTitle>Date &amp; User Detail</CardTitle>
          <CardDescription>Each date/user pair with its own counts</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Done</TableHead>
                  <TableHead>Pending</TableHead>
                  <TableHead>Error</TableHead>
                  <TableHead>Match</TableHead>
                  <TableHead>Mismatch</TableHead>
                  <TableHead className="w-40">Progress</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detailRows.map(row => (
                  <TableRow key={`${row.date}-${row.user}`}>
                    <TableCell className="font-medium whitespace-nowrap">{row.date}</TableCell>
                    <TableCell>{row.user}</TableCell>
                    <TableCell>{row.total}</TableCell>
                    <TableCell className="text-green-600">{row.done}</TableCell>
                    <TableCell className="text-yellow-600">{row.pending}</TableCell>
                    <TableCell className="text-red-600">{row.error}</TableCell>
                    <TableCell className="text-green-600">{row.match}</TableCell>
                    <TableCell className="text-orange-600 font-bold">{row.mismatch}</TableCell>
                    <TableCell>
                      <CompletionBar done={row.done} error={row.error} total={row.total} />
                    </TableCell>
                  </TableRow>
                ))}
                {detailRows.length === 0 && !errorMessage && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-slate-500">
                      No detail rows.
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
