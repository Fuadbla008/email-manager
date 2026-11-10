import { connection } from 'next/server'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { fetchAllRows } from '@/lib/supabase/fetch-all'
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

function emptyBucket(date) {
  return {
    date,
    uploaded: 0,
    assigned: 0,
    unassigned: 0,
    pending: 0,
    done: 0,
    error: 0,
    verifiedDone: 0,
    verifiedError: 0,
    verifiedPending: 0,
  }
}

export default async function UploadsPage() {
  await connection()
  const supabase = await createClient()
  const today = todayDhaka()

  let rows = []
  let errorMessage = null
  try {
    rows = await fetchAllRows(() =>
      supabase
        .from('email_credentials')
        .select('id, upload_date, assign_date, assigned_to, status, verified_status')
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
    )
  } catch (error) {
    errorMessage = error.message
  }

  const map = new Map()
  ;(rows ?? []).forEach(row => {
    const key = row.upload_date || row.assign_date || 'Unknown'
    if (!map.has(key)) map.set(key, emptyBucket(key))
    const bucket = map.get(key)
    bucket.uploaded++
    if (row.assigned_to) bucket.assigned++
    else bucket.unassigned++
    if (bucket[row.status] !== undefined) bucket[row.status]++
    if (row.verified_status === 'done') bucket.verifiedDone++
    else if (row.verified_status === 'error') bucket.verifiedError++
    else bucket.verifiedPending++
  })

  const buckets = Array.from(map.values()).sort((a, b) => String(b.date).localeCompare(String(b.date)))
  const totals = buckets.reduce((acc, b) => ({
    uploaded: acc.uploaded + b.uploaded,
    assigned: acc.assigned + b.assigned,
    unassigned: acc.unassigned + b.unassigned,
    done: acc.done + b.done,
    error: acc.error + b.error,
    pending: acc.pending + b.pending,
  }), { uploaded: 0, assigned: 0, unassigned: 0, done: 0, error: 0, pending: 0 })
  // Completion is measured against assigned work: done + error are finished,
  // pending is the only remaining work. Unassigned rows are shown separately.
  const overallBase = totals.assigned > 0 ? totals.assigned : totals.uploaded
  const overallPct = completionPct(totals.done, totals.error, overallBase)

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Upload Batches (Date-wise)</h1>
          <p className="text-sm text-slate-500">
            How many credentials were uploaded on each date, how many were assigned,
            and how many are still left. Today: {today} (Asia/Dhaka)
          </p>
        </div>
        <Link href="/admin/upload" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
          Upload New Batch
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
            <CardDescription>Uploaded (all batches)</CardDescription>
            <CardTitle className="text-3xl">{totals.uploaded}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Assigned</CardDescription>
            <CardTitle className="text-3xl text-blue-600">{totals.assigned}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Remaining (unassigned)</CardDescription>
            <CardTitle className="text-3xl text-yellow-600">{totals.unassigned}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Completion (of assigned)</CardDescription>
            <CardTitle className="text-3xl">{overallPct}%</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Per Upload Date</CardTitle>
          <CardDescription>
            Done/Error are the users&apos; claims. Verified columns are the admin&apos;s results.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Upload Date</TableHead>
                  <TableHead>Uploaded</TableHead>
                  <TableHead>Assigned</TableHead>
                  <TableHead>Remaining</TableHead>
                  <TableHead>Pending</TableHead>
                  <TableHead>Done</TableHead>
                  <TableHead>Error</TableHead>
                  <TableHead>Verified ✓</TableHead>
                  <TableHead>Verified ✗</TableHead>
                  <TableHead className="w-44">Progress</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {buckets.map(b => {
                  const base = b.assigned > 0 ? b.assigned : b.uploaded
                  return (
                    <TableRow key={b.date}>
                      <TableCell className="font-medium whitespace-nowrap">{b.date}</TableCell>
                      <TableCell>{b.uploaded}</TableCell>
                      <TableCell>{b.assigned}</TableCell>
                      <TableCell className="text-yellow-600 font-medium">{b.unassigned}</TableCell>
                      <TableCell>{b.pending}</TableCell>
                      <TableCell className="text-green-600">{b.done}</TableCell>
                      <TableCell className="text-red-600">{b.error}</TableCell>
                      <TableCell>{b.verifiedDone}</TableCell>
                      <TableCell>{b.verifiedError}</TableCell>
                      <TableCell>
                        <CompletionBar done={b.done} error={b.error} total={base} />
                      </TableCell>
                    </TableRow>
                  )
                })}
                {buckets.length === 0 && !errorMessage && (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-8 text-slate-500">
                      No uploads found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <div className="mt-4 flex flex-wrap gap-2">
        <Link href="/admin/assign" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
          Assign Credentials
        </Link>
        <Link href="/admin/reports" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
          Open Detailed Reports
        </Link>
      </div>
    </div>
  )
}
