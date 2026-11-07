'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { assignCredentials, assignNextCredentials } from '@/app/actions/admin'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { toast } from 'sonner'

export default function AssignPage() {
  const supabase = createClient()
  const [users, setUsers] = useState([])
  const [pool, setPool] = useState([])
  const [selectedIds, setSelectedIds] = useState([])
  const [selectedUser, setSelectedUser] = useState('')
  const [date, setDate] = useState('')
  const [uploadDate, setUploadDate] = useState('')
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(false)
  const [quickCount, setQuickCount] = useState('30')

  useEffect(() => {
    const now = new Date()
    const dhaka = new Date(now.getTime() + 6 * 60 * 60 * 1000)
    const params = new URLSearchParams(window.location.search)
    const initialDate = params.get('date') || dhaka.toISOString().slice(0, 10)
    setDate(initialDate)
    setUploadDate(params.get('upload') || initialDate)
    const presetUser = params.get('user')
    if (presetUser) setSelectedUser(presetUser)
  }, [])

  const fetchPool = useCallback(async (targetUploadDate) => {
    let query = supabase
      .from('email_credentials')
      .select('id, email, password, upload_date')
      .is('assigned_to', null)
      .order('created_at', { ascending: false })
      .limit(500)
    if (targetUploadDate) query = query.eq('upload_date', targetUploadDate)
    const { data } = await query
    setPool(data ?? [])
  }, [supabase])

  useEffect(() => {
    async function init() {
      if (!uploadDate) return
      setLoading(true)
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .eq('role', 'user')
      setUsers(profiles ?? [])
      await fetchPool(uploadDate)
      setLoading(false)
    }
    init()
  }, [uploadDate, supabase, fetchPool])

  function changeUploadDate(value) {
    if (!value) return
    // Keep assign date in sync while it still matches the previous batch date.
    if (!date || date === uploadDate) setDate(value)
    setUploadDate(value)
  }

  const filtered = pool.filter(r =>
    !search.trim() || r.email.toLowerCase().includes(search.toLowerCase())
  )

  function toggle(id) {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  function toggleAll() {
    const ids = filtered.map(p => p.id)
    const all = ids.length > 0 && ids.every(id => selectedIds.includes(id))
    if (all) setSelectedIds(prev => prev.filter(id => !ids.includes(id)))
    else setSelectedIds(prev => Array.from(new Set([...prev, ...ids])))
  }

  async function handleAssign() {
    if (!selectedUser || !date || selectedIds.length === 0) {
      toast.error('Select user, date, and at least one credential.')
      return
    }
    setBusy(true)
    const res = await assignCredentials(selectedIds, selectedUser, date, uploadDate)
    setBusy(false)
    if (res?.error) toast.error(res.error)
    else {
      toast.success(`Assigned ${res.updated} credentials to user.`)
      setSelectedIds([])
      await fetchPool(uploadDate)
    }
  }

  async function handleQuickAssign() {
    const count = Number(quickCount)
    if (!selectedUser || !date) {
      toast.error('Select user and date first.')
      return
    }
    if (!Number.isInteger(count) || count < 1 || count > 500) {
      toast.error('Enter a count between 1 and 500.')
      return
    }
    setBusy(true)
    const res = await assignNextCredentials(selectedUser, date, count, uploadDate)
    setBusy(false)
    if (res?.error) toast.error(res.error)
    else {
      toast.success(
        `Assigned ${res.updated} credential(s)${res.shortfall ? ` — only ${res.updated} were available` : ''}.`
      )
      setSelectedIds([])
      await fetchPool(uploadDate)
    }
  }

  if (loading && users.length === 0) return <div>Loading…</div>

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Assign Credentials</h1>

      <Card className="mb-6">
        <CardHeader><CardTitle>Assignment Settings</CardTitle></CardHeader>
        <CardContent className="flex gap-4 flex-wrap items-end">
          <div className="space-y-1">
            <Label>User</Label>
            <Select value={selectedUser} onValueChange={setSelectedUser}>
              <SelectTrigger className="w-56"><SelectValue placeholder="Select user" /></SelectTrigger>
              <SelectContent>
                {users.map(u => (
                  <SelectItem key={u.id} value={u.id}>{u.full_name || u.email}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Upload date (batch)</Label>
            <Input
              type="date"
              value={uploadDate}
              onChange={e => changeUploadDate(e.target.value)}
              className="w-44"
            />
          </div>
          <div className="space-y-1">
            <Label>Assign date</Label>
            <Input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="w-44"
            />
          </div>
          <div className="space-y-1">
            <Label>Search pool</Label>
            <Input
              placeholder="Search email…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-56"
            />
          </div>
          <Button onClick={handleAssign} disabled={busy || selectedIds.length === 0 || !selectedUser || !date}>
            {busy ? 'Assigning…' : `Assign Selected (${selectedIds.length})`}
          </Button>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Quick Assign (by quantity)</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-4 flex-wrap items-end">
          <div className="space-y-1">
            <Label>How many credentials?</Label>
            <Input
              type="number"
              min="1"
              max="500"
              placeholder="e.g. 30, 50, 100"
              value={quickCount}
              onChange={e => setQuickCount(e.target.value)}
              className="w-44"
            />
          </div>
          <Button onClick={handleQuickAssign} disabled={busy || !selectedUser || !date}>
            {busy ? 'Assigning…' : `Auto-assign ${quickCount || 0} credentials`}
          </Button>
          <p className="text-xs text-slate-500 pb-1">
            Picks the oldest unassigned credentials from the {uploadDate || 'selected'} upload batch.
            Max 500 per click.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            Unassigned Pool — {uploadDate || 'all dates'} ({filtered.length} shown / {pool.length} loaded)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-h-[600px] overflow-auto border rounded">
            <Table>
              <TableHeader className="sticky top-0 bg-white z-10">
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox
                      checked={filtered.length > 0 && filtered.every(r => selectedIds.includes(r.id))}
                      onCheckedChange={toggleAll}
                    />
                  </TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Password</TableHead>
                  <TableHead>Upload Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(r => (
                  <TableRow key={r.id} className={selectedIds.includes(r.id) ? 'bg-blue-50' : ''}>
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.includes(r.id)}
                        onCheckedChange={() => toggle(r.id)}
                      />
                    </TableCell>
                    <TableCell className="font-mono text-sm">{r.email}</TableCell>
                    <TableCell className="font-mono text-sm">{r.password}</TableCell>
                    <TableCell className="text-sm text-slate-500">{r.upload_date || '—'}</TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-6 text-slate-500">
                      No unassigned credentials for this upload date.
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