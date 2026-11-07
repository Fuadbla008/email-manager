'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { cacheGet, cacheKey, cacheRemovePrefix, cacheSet } from '@/lib/client-cache'
import { unassignCredentials } from '@/app/actions/admin'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { toast } from 'sonner'

const PAGE_SIZE = 50
const MAX_UNASSIGN = 50

export default function CredentialsPage() {
  const supabase = useMemo(() => createClient(), [])
  const [rows, setRows] = useState([])
  const [users, setUsers] = useState([])
  const [selectedIds, setSelectedIds] = useState([])
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterUser, setFilterUser] = useState('all')
  const [filterDate, setFilterDate] = useState('')
  const [filterUploadDate, setFilterUploadDate] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    supabase.from('profiles').select('id, full_name, email').eq('role', 'user')
      .then(({ data }) => setUsers(data || []))
  }, [supabase])

  useEffect(() => { setPage(0) }, [filterStatus, filterUser, filterDate, filterUploadDate, search])

  useEffect(() => {
    let cancelled = false
    const cacheId = cacheKey(
      'admin:credentials',
      filterStatus,
      filterUser,
      filterDate,
      filterUploadDate,
      search.trim().toLowerCase(),
      page
    )
    const cached = cacheGet(cacheId)
    if (cached) {
      setRows(cached.rows)
      setTotal(cached.total)
      setLoading(false)
    } else {
      setLoading(true)
    }

    async function fetchData() {
      let q = supabase
        .from('email_credentials')
        .select(
          'id, email, password, status, assign_date, upload_date, assigned_to, verified_status, completed_at, assigned_profile:profiles!assigned_to(full_name, email)',
          { count: 'exact' }
        )
        .order('created_at', { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)

      if (filterStatus !== 'all') q = q.eq('status', filterStatus)
      if (filterUser !== 'all') q = q.eq('assigned_to', filterUser)
      if (filterDate) q = q.eq('assign_date', filterDate)
      if (filterUploadDate) q = q.eq('upload_date', filterUploadDate)
      if (search.trim()) q = q.ilike('email', `%${search.trim()}%`)

      const { data, count, error } = await q
      if (cancelled) return
      if (error) {
        console.error(error)
        toast.error(error.message)
      } else {
        const nextRows = data || []
        const nextTotal = count || 0
        setRows(nextRows)
        setTotal(nextTotal)
        setSelectedIds([])
        cacheSet(cacheId, { rows: nextRows, total: nextTotal }, 60 * 1000)
      }
      setLoading(false)
    }
    fetchData()
    return () => { cancelled = true }
  }, [supabase, filterStatus, filterUser, filterDate, filterUploadDate, search, page, refreshKey])

  function toggle(id) {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  function toggleAll() {
    const ids = rows.map(r => r.id)
    const all = ids.length > 0 && ids.every(id => selectedIds.includes(id))
    setSelectedIds(all ? [] : ids)
  }

  async function handleUnassign() {
    if (selectedIds.length === 0) return
    if (selectedIds.length > MAX_UNASSIGN) {
      toast.error(`Max ${MAX_UNASSIGN} per batch. Selected: ${selectedIds.length}`)
      return
    }
    if (!confirm(`Unassign ${selectedIds.length} credentials?`)) return
    const ids = selectedIds
    const snapshotRows = rows
    const snapshotTotal = total
    setBusy(true)
    setRows(prev => prev.filter(row => !ids.includes(row.id)))
    setTotal(prev => Math.max(0, prev - ids.length))
    setSelectedIds([])

    const res = await unassignCredentials(ids)
    setBusy(false)
    if (res?.error) {
      setRows(snapshotRows)
      setTotal(snapshotTotal)
      toast.error(res.error)
    } else {
      toast.success(`Unassigned ${ids.length}`)
      cacheRemovePrefix('admin:credentials')
      setRefreshKey(k => k + 1)
    }
  }

  function exportCSV() {
    if (rows.length === 0) return toast.error('No data')
    const headers = ['Email', 'Password', 'Status', 'Verified Status', 'Assigned To', 'Upload Date', 'Assign Date', 'Completed At']
    const escape = v => `"${String(v ?? '').replace(/"/g, '""')}"`
    const lines = [headers.join(',')]
    rows.forEach(r => {
      lines.push([
        r.email,
        r.password,
        r.status,
        r.verified_status || '',
        r.assigned_profile?.full_name || r.assigned_profile?.email || '',
        r.upload_date || '',
        r.assign_date || '',
        r.completed_at || '',
      ].map(escape).join(','))
    })
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `credentials_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('CSV downloaded')
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)
  const statusColor = s =>
    s === 'done' ? 'bg-green-100 text-green-800'
    : s === 'error' ? 'bg-red-100 text-red-800'
    : 'bg-yellow-100 text-yellow-800'

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">All Credentials</h1>

      <Card className="mb-4">
        <CardContent className="pt-4 flex gap-3 items-end flex-wrap">
          <div>
            <Label>Status</Label>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="done">Done</SelectItem>
                <SelectItem value="error">Error</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>User</Label>
            <Select value={filterUser} onValueChange={setFilterUser}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Users</SelectItem>
                {users.map(u => <SelectItem key={u.id} value={u.id}>{u.full_name || u.email}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Upload date</Label>
            <Input
              type="date"
              value={filterUploadDate}
              onChange={e => setFilterUploadDate(e.target.value)}
              className="w-40"
            />
          </div>
          <div>
            <Label>Assign date</Label>
            <Input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)} className="w-40" />
          </div>
          <div>
            <Label>Search email</Label>
            <Input
              placeholder="Search…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-56"
            />
          </div>
          <Button
            variant="destructive"
            disabled={selectedIds.length === 0 || busy}
            onClick={handleUnassign}
          >
            {busy ? 'Unassigning…' : `Unassign (${selectedIds.length})`}
          </Button>
          <Button variant="outline" onClick={() => setRefreshKey(k => k + 1)} disabled={loading}>
            Refresh
          </Button>
          <Button variant="outline" onClick={exportCSV} disabled={rows.length === 0}>
            Export CSV
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="max-h-[600px] overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-white z-10">
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox
                      checked={rows.length > 0 && rows.every(r => selectedIds.includes(r.id))}
                      onCheckedChange={toggleAll}
                    />
                  </TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Password</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Verified</TableHead>
                  <TableHead>Assigned To</TableHead>
                  <TableHead>Upload Date</TableHead>
                  <TableHead>Assign Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(r => (
                  <TableRow key={r.id} className={selectedIds.includes(r.id) ? 'bg-blue-50' : ''}>
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.includes(r.id)}
                        onCheckedChange={() => toggle(r.id)}
                      />
                    </TableCell>
                    <TableCell className="font-mono text-sm">{r.email}</TableCell>
                    <TableCell className="font-mono text-sm">{r.password}</TableCell>
                    <TableCell>
                      <Badge className={statusColor(r.status)}>{r.status}</Badge>
                    </TableCell>
                    <TableCell>
                      {r.verified_status ? (
                        <Badge className={r.verified_status === 'done' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}>
                          {r.verified_status}
                        </Badge>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {r.assigned_profile?.full_name || r.assigned_profile?.email || '—'}
                    </TableCell>
                    <TableCell className="text-sm text-slate-500">{r.upload_date || '—'}</TableCell>
                    <TableCell className="text-sm">{r.assign_date || '—'}</TableCell>
                  </TableRow>
                ))}
                {rows.length === 0 && !loading && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-slate-500">
                      No credentials match the filters.
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
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0 || loading}
              >
                Prev
              </Button>
              <span className="text-sm">Page {page + 1} / {Math.max(1, totalPages)}</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => p + 1)}
                disabled={page + 1 >= totalPages || loading}
              >
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}