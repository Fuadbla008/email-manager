import Link from 'next/link'
import { requireRole } from '@/lib/auth'
import { getSupervisorAssignedRows } from '@/lib/supabase/cached'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

function emptyBucket(label) {
  return { label, total: 0, pending: 0, done: 0, error: 0, verifiedDone: 0, verifiedError: 0 }
}

function addToBucket(bucket, row) {
  bucket.total++
  if (bucket[row.status] !== undefined) bucket[row.status]++
  if (row.verified_status === 'done') bucket.verifiedDone++
  else if (row.verified_status === 'error') bucket.verifiedError++
}

export default async function SupervisorDashboard() {
  const { user } = await requireRole(['supervisor', 'admin'])

  let rows = []
  let errorMessage = null
  try {
    rows = await getSupervisorAssignedRows(user.id)
  } catch (error) {
    errorMessage = error.message
  }

  const perDate = new Map()
  const perUser = new Map()
  const totals = emptyBucket('all')

  ;(rows ?? []).forEach(row => {
    const dateKey = row.assign_date || 'No date'
    if (!perDate.has(dateKey)) perDate.set(dateKey, emptyBucket(dateKey))
    addToBucket(perDate.get(dateKey), row)

    const userKey = row.assigned_to || 'unassigned'
    if (!perUser.has(userKey)) {
      perUser.set(userKey, {
        ...emptyBucket(row.assigned_profile?.full_name || row.assigned_profile?.email || 'Unknown user'),
        id: row.assigned_to,
      })
    }
    addToBucket(perUser.get(userKey), row)
    addToBucket(totals, row)
  })

  const dateRows = Array.from(perDate.values()).sort((a, b) => String(b.label).localeCompare(String(a.label)))
  const userRows = Array.from(perUser.values()).sort((a, b) => b.total - a.total)
  const pct = totals.total > 0 ? Math.round((totals.done / totals.total) * 100) : 0

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Supervisor Overview</h1>
          <p className="text-sm text-slate-500">
            Only credentials that you assigned appear here.
          </p>
        </div>
        <Link href="/supervisor/assign" className={buttonVariants({ size: 'sm' })}>
          Assign Credentials
        </Link>
      </div>

      {errorMessage && (
        <Card className="mb-4">
          <CardContent className="py-6 text-center text-red-600">{errorMessage}</CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Assigned by you</CardDescription>
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
            <CardDescription>Pending</CardDescription>
            <CardTitle className="text-3xl text-yellow-600">{totals.pending}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Completion</CardDescription>
            <CardTitle className="text-3xl">{pct}%</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Per User</CardTitle>
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
                    </TableRow>
                  ))}
                  {userRows.length === 0 && !errorMessage && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-slate-500">
                        You have not assigned any credentials yet.
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
            <CardTitle>Per Date</CardTitle>
            <CardDescription>Assignment date totals for your work</CardDescription>
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
                    <TableHead>Verified</TableHead>
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
                      <TableCell>{row.verifiedDone + row.verifiedError}</TableCell>
                    </TableRow>
                  ))}
                  {dateRows.length === 0 && !errorMessage && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-slate-500">
                        No assignment dates yet.
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
