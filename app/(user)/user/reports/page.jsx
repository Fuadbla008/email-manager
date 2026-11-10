import { connection } from 'next/server'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { fetchAllRows } from '@/lib/supabase/fetch-all'
import CompletionBar from '@/components/completion-bar'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'

export default async function UserReportsPage() {
  await connection()
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  let rows = []
  let errorMessage = null
  try {
    rows = await fetchAllRows(() =>
      supabase
        .from('email_credentials')
        .select('id, assign_date, status, verified_status')
        .eq('assigned_to', user.id)
        .not('assign_date', 'is', null)
        .order('id', { ascending: true })
    )
  } catch (error) {
    errorMessage = error.message
  }

  const map = new Map()
  ;(rows || []).forEach(r => {
    if (!map.has(r.assign_date)) {
      map.set(r.assign_date, {
        date: r.assign_date, total: 0, done: 0, pending: 0, error: 0,
        verified_done: 0, verified_error: 0, not_verified: 0,
        match: 0, mismatch: 0,
      })
    }
    const row = map.get(r.assign_date)
    row.total++
    if (row[r.status] !== undefined) row[r.status]++
    if (r.verified_status === 'done') row.verified_done++
    else if (r.verified_status === 'error') row.verified_error++
    else row.not_verified++
    if (r.verified_status) {
      if (r.status === r.verified_status) row.match++
      else row.mismatch++
    }
  })
  const arr = Array.from(map.values()).sort((a, b) => b.date.localeCompare(a.date))

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">My Reports</h1>
      <p className="text-sm text-slate-500 mb-6">
        Compare what you claimed vs what admin verified.
      </p>

      {errorMessage && (
        <Card className="mb-4">
          <CardContent className="py-6 text-center text-red-600">{errorMessage}</CardContent>
        </Card>
      )}

      {arr.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-slate-500">No data yet.</CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0 overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Your Done</TableHead>
                  <TableHead>Pending</TableHead>
                  <TableHead>Error</TableHead>
                  <TableHead className="w-40">Progress</TableHead>
                  <TableHead>Verified ✓</TableHead>
                  <TableHead>Verified ✗</TableHead>
                  <TableHead>Not Verified</TableHead>
                  <TableHead>Match</TableHead>
                  <TableHead>Flagged</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {arr.map(r => (
                  <TableRow key={r.date}>
                    <TableCell className="font-medium">{r.date}</TableCell>
                    <TableCell>{r.total}</TableCell>
                    <TableCell className="text-green-600">{r.done}</TableCell>
                    <TableCell className="text-yellow-600">{r.pending}</TableCell>
                    <TableCell className="text-red-600">{r.error}</TableCell>
                    <TableCell>
                      <CompletionBar done={r.done} error={r.error} total={r.total} />
                    </TableCell>
                    <TableCell>{r.verified_done}</TableCell>
                    <TableCell>{r.verified_error}</TableCell>
                    <TableCell>{r.not_verified}</TableCell>
                    <TableCell className="text-green-600">{r.match}</TableCell>
                    <TableCell>
                      {r.mismatch > 0
                        ? <Badge className="bg-orange-100 text-orange-800">{r.mismatch} flagged</Badge>
                        : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}