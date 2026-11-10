'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import * as XLSX from 'xlsx'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { fetchAllRows } from '@/lib/supabase/fetch-all'
import { downloadCsv } from '@/lib/csv'
import { exportAdminCredentials } from '@/app/actions/export'
import CompletionBar from '@/components/completion-bar'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'

function todayDhaka() {
  const now = new Date()
  const dhaka = new Date(now.getTime() + 6 * 60 * 60 * 1000)
  return dhaka.toISOString().slice(0, 10)
}

function downloadExcel(filename, sheets) {
  const wb = XLSX.utils.book_new()
  sheets.forEach(({ name, rows }) => {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), name)
  })
  XLSX.writeFile(wb, filename)
}

function aggregate(rows, groupKeyFn) {
  const map = new Map()
  rows.forEach(r => {
    const key = groupKeyFn(r)
    if (!map.has(key)) {
      map.set(key, {
        key,
        user_name: r.profiles?.full_name || r.profiles?.email || '',
        total: 0, done: 0, pending: 0, error: 0,
        verified_done: 0, verified_error: 0, not_verified: 0,
        match: 0, mismatch: 0,
      })
    }
    const row = map.get(key)
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
  return Array.from(map.values())
}

export default function ReportsPage() {
  const supabase = useMemo(() => createClient(), [])
  const [users, setUsers] = useState([])

  const [date, setDate] = useState('')
  const [perDate, setPerDate] = useState([])
  const [loadingDate, setLoadingDate] = useState(false)

  const [userId, setUserId] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [perUser, setPerUser] = useState([])
  const [loadingUser, setLoadingUser] = useState(false)

  const [dDate, setDDate] = useState('')
  const [dUser, setDUser] = useState('all')
  const [disc, setDisc] = useState([])
  const [loadingDisc, setLoadingDisc] = useState(false)
  const [exportingDetail, setExportingDetail] = useState(false)

  useEffect(() => {
    const t = todayDhaka()
    setDate(t)
    setFromDate(t)
    setToDate(t)
    setDDate(t)
  }, [])

  useEffect(() => {
    let cancelled = false
    fetchAllRows(() =>
      supabase
        .from('profiles')
        .select('id, full_name, email')
        .eq('role', 'user')
        .order('id', { ascending: true })
    )
      .then(data => { if (!cancelled) setUsers(data) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [supabase])

  // Tab 1: Per date
  useEffect(() => {
    if (!date) return
    let cancelled = false
    setLoadingDate(true)

    // Page through every row: a single `.select()` stops at the PostgREST row
    // cap (1000 by default) and would undercount busy dates.
    fetchAllRows(() =>
      supabase
        .from('email_credentials')
        .select('id, assigned_to, status, verified_status, profiles!assigned_to(full_name, email)')
        .eq('assign_date', date)
        .not('assigned_to', 'is', null)
        .order('id', { ascending: true })
    )
      .then(data => {
        if (cancelled) return
        setPerDate(aggregate(data, r => r.assigned_to))
      })
      .catch(error => {
        if (!cancelled) toast.error(error.message)
      })
      .finally(() => {
        if (!cancelled) setLoadingDate(false)
      })

    return () => { cancelled = true }
  }, [date, supabase])

  // Tab 2: Per user
  useEffect(() => {
    if (!userId || !fromDate || !toDate) { setPerUser([]); return }
    let cancelled = false
    setLoadingUser(true)

    fetchAllRows(() =>
      supabase
        .from('email_credentials')
        .select('id, assign_date, status, verified_status, profiles!assigned_to(full_name, email)')
        .eq('assigned_to', userId)
        .gte('assign_date', fromDate)
        .lte('assign_date', toDate)
        .order('id', { ascending: true })
    )
      .then(data => {
        if (cancelled) return
        setPerUser(
          aggregate(data, r => r.assign_date)
            .sort((a, b) => String(b.key).localeCompare(String(a.key)))
        )
      })
      .catch(error => {
        if (!cancelled) toast.error(error.message)
      })
      .finally(() => {
        if (!cancelled) setLoadingUser(false)
      })

    return () => { cancelled = true }
  }, [userId, fromDate, toDate, supabase])

  // Tab 3: Discrepancies
  useEffect(() => {
    if (!dDate) return
    let cancelled = false
    setLoadingDisc(true)

    fetchAllRows(() => {
      let q = supabase
        .from('email_credentials')
        .select('id, email, status, verified_status, assign_date, assigned_to, profiles!assigned_to(full_name, email)')
        .eq('assign_date', dDate)
        .not('verified_status', 'is', null)
      if (dUser !== 'all') q = q.eq('assigned_to', dUser)
      return q.order('id', { ascending: true })
    })
      .then(data => {
        if (!cancelled) setDisc(data.filter(r => r.status !== r.verified_status))
      })
      .catch(error => {
        if (!cancelled) toast.error(error.message)
      })
      .finally(() => {
        if (!cancelled) setLoadingDisc(false)
      })

    return () => { cancelled = true }
  }, [dDate, dUser, supabase])

  async function downloadDetail(filters) {
    if (exportingDetail) return
    setExportingDetail(true)
    const res = await exportAdminCredentials(filters)
    setExportingDetail(false)
    if (res?.error) return toast.error(res.error)
    downloadCsv(res.filename, res.csv)
    toast.success(`Downloaded ${res.count} row(s)`)
  }

  function exportPerDate() {
    if (perDate.length === 0) return toast.error('No data')
    downloadExcel(`report_${date}.xlsx`, [{
      name: 'Summary',
      rows: perDate.map(r => ({
        User: r.user_name,
        Total: r.total,
        Done: r.done,
        Pending: r.pending,
        Error: r.error,
        'Verified Done': r.verified_done,
        'Verified Error': r.verified_error,
        'Not Verified': r.not_verified,
        Match: r.match,
        Mismatch: r.mismatch,
      })),
    }])
    toast.success('Excel downloaded')
  }

  function exportPerUser() {
    if (perUser.length === 0) return toast.error('No data')
    const u = users.find(x => x.id === userId)
    downloadExcel(`report_${u?.full_name || 'user'}_${fromDate}_to_${toDate}.xlsx`, [{
      name: 'Summary',
      rows: perUser.map(r => ({
        Date: r.key,
        Total: r.total,
        Done: r.done,
        Pending: r.pending,
        Error: r.error,
        'Verified Done': r.verified_done,
        'Verified Error': r.verified_error,
        'Not Verified': r.not_verified,
        Match: r.match,
        Mismatch: r.mismatch,
      })),
    }])
    toast.success('Excel downloaded')
  }

  function exportDisc() {
    if (disc.length === 0) return toast.error('No discrepancies')
    downloadExcel(`discrepancies_${dDate}.xlsx`, [{
      name: 'Discrepancies',
      rows: disc.map(r => ({
        Email: r.email,
        User: r.profiles?.full_name || r.profiles?.email || '',
        Claim: r.status,
        Actual: r.verified_status,
        Date: r.assign_date,
      })),
    }])
    toast.success('Excel downloaded')
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Reports</h1>
          <p className="text-sm text-slate-500">Claim vs. verified results, date-wise and user-wise.</p>
        </div>
        <Link href="/admin/uploads" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
          Upload Batch Summary
        </Link>
      </div>
      <Tabs defaultValue="date">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="date">Per Date</TabsTrigger>
          <TabsTrigger value="user">Per User</TabsTrigger>
          <TabsTrigger value="disc">Discrepancies</TabsTrigger>
        </TabsList>

        <TabsContent value="date">
          <Card className="mb-4">
            <CardContent className="pt-4 flex gap-3 items-end flex-wrap">
              <div>
                <Label>Date</Label>
                <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-48" />
              </div>
              <Button onClick={exportPerDate} disabled={perDate.length === 0}>Export Excel</Button>
              <Button
                variant="outline"
                onClick={() => downloadDetail({ date })}
                disabled={exportingDetail || !date}
              >
                {exportingDetail ? 'Preparing…' : 'Export Detail CSV'}
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-0 overflow-auto">
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
                  {perDate.map(r => (
                    <TableRow key={r.key}>
                      <TableCell className="font-medium">{r.user_name}</TableCell>
                      <TableCell>{r.total}</TableCell>
                      <TableCell className="text-green-600">{r.done}</TableCell>
                      <TableCell className="text-yellow-600">{r.pending}</TableCell>
                      <TableCell className="text-red-600">{r.error}</TableCell>
                      <TableCell>{r.verified_done}</TableCell>
                      <TableCell>{r.verified_error}</TableCell>
                      <TableCell>{r.not_verified}</TableCell>
                      <TableCell className="text-green-600">{r.match}</TableCell>
                      <TableCell className="text-orange-600 font-bold">{r.mismatch}</TableCell>
                      <TableCell>
                        <CompletionBar done={r.done} error={r.error} total={r.total} />
                      </TableCell>
                    </TableRow>
                  ))}
                  {perDate.length === 0 && !loadingDate && (
                    <TableRow>
                      <TableCell colSpan={11} className="text-center py-6 text-slate-500">
                        No data for {date}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="user">
          <Card className="mb-4">
            <CardContent className="pt-4 flex gap-3 items-end flex-wrap">
              <div>
                <Label>User</Label>
                <Select value={userId} onValueChange={setUserId}>
                  <SelectTrigger className="w-56"><SelectValue placeholder="Select user" /></SelectTrigger>
                  <SelectContent>
                    {users.map(u => <SelectItem key={u.id} value={u.id}>{u.full_name || u.email}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>From</Label>
                <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="w-40" />
              </div>
              <div>
                <Label>To</Label>
                <Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="w-40" />
              </div>
              <Button onClick={exportPerUser} disabled={perUser.length === 0}>Export Excel</Button>
              <Button
                variant="outline"
                onClick={() => downloadDetail({ userId, from: fromDate, to: toDate })}
                disabled={exportingDetail || !userId}
              >
                {exportingDetail ? 'Preparing…' : 'Export Detail CSV'}
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-0 overflow-auto">
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
                  {perUser.map(r => (
                    <TableRow key={r.key}>
                      <TableCell className="font-medium">{r.key}</TableCell>
                      <TableCell>{r.total}</TableCell>
                      <TableCell className="text-green-600">{r.done}</TableCell>
                      <TableCell className="text-yellow-600">{r.pending}</TableCell>
                      <TableCell className="text-red-600">{r.error}</TableCell>
                      <TableCell>{r.verified_done}</TableCell>
                      <TableCell>{r.verified_error}</TableCell>
                      <TableCell className="text-green-600">{r.match}</TableCell>
                      <TableCell className="text-orange-600 font-bold">{r.mismatch}</TableCell>
                      <TableCell>
                        <CompletionBar done={r.done} error={r.error} total={r.total} />
                      </TableCell>
                    </TableRow>
                  ))}
                  {perUser.length === 0 && !loadingUser && (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center py-6 text-slate-500">
                        {userId ? 'No data for selected range' : 'Select a user and date range'}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="disc">
          <Card className="mb-4">
            <CardContent className="pt-4 flex gap-3 items-end flex-wrap">
              <div>
                <Label>Date</Label>
                <Input type="date" value={dDate} onChange={e => setDDate(e.target.value)} className="w-48" />
              </div>
              <div>
                <Label>User</Label>
                <Select value={dUser} onValueChange={setDUser}>
                  <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Users</SelectItem>
                    {users.map(u => <SelectItem key={u.id} value={u.id}>{u.full_name || u.email}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={exportDisc} disabled={disc.length === 0}>Export Excel</Button>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-0 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Claimed</TableHead>
                    <TableHead>Actual (Verified)</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {disc.map(r => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-sm">{r.email}</TableCell>
                      <TableCell>{r.profiles?.full_name || r.profiles?.email}</TableCell>
                      <TableCell>
                        <Badge className={
                          r.status === 'done' ? 'bg-green-100 text-green-800'
                          : r.status === 'error' ? 'bg-red-100 text-red-800'
                          : 'bg-yellow-100 text-yellow-800'
                        }>
                          {r.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={
                          r.verified_status === 'done'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-red-100 text-red-800'
                        }>
                          {r.verified_status}
                        </Badge>
                      </TableCell>
                      <TableCell>{r.assign_date}</TableCell>
                    </TableRow>
                  ))}
                  {disc.length === 0 && !loadingDisc && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-6 text-slate-500">
                        No discrepancies on {dDate}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}