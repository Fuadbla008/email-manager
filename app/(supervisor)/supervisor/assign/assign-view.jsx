'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { supervisorAssignSelected, supervisorAssignNext } from '@/app/actions/supervisor'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export default function SupervisorAssignView({
  users,
  pool,
  uploadDate,
  assignDate: initialAssignDate,
  availableDates,
  remaining,
}) {
  const router = useRouter()
  const [selectedUser, setSelectedUser] = useState('')
  const [assignDate, setAssignDate] = useState(initialAssignDate)
  const [selectedIds, setSelectedIds] = useState([])
  const [search, setSearch] = useState('')
  const [quickCount, setQuickCount] = useState('30')
  const [busy, setBusy] = useState(false)

  const filtered = pool.filter(r =>
    !search.trim() || r.email.toLowerCase().includes(search.toLowerCase())
  )

  function changeUploadDate(value) {
    if (!value) return
    router.push(`/supervisor/assign?upload=${value}`)
  }

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
    if (!selectedUser || !assignDate) {
      toast.error('Select a user and an assign date.')
      return
    }
    if (selectedIds.length === 0) {
      toast.error('Select at least one credential.')
      return
    }
    setBusy(true)
    const res = await supervisorAssignSelected(selectedIds, selectedUser, assignDate, uploadDate)
    setBusy(false)
    if (res?.error) toast.error(res.error)
    else {
      toast.success(`Assigned ${res.updated} credential(s).`)
      setSelectedIds([])
      router.refresh()
    }
  }

  async function handleQuickAssign() {
    const count = Number(quickCount)
    if (!selectedUser || !assignDate) {
      toast.error('Select a user and an assign date first.')
      return
    }
    if (!Number.isInteger(count) || count < 1 || count > 500) {
      toast.error('Enter a count between 1 and 500.')
      return
    }
    setBusy(true)
    const res = await supervisorAssignNext(selectedUser, assignDate, count, uploadDate)
    setBusy(false)
    if (res?.error) toast.error(res.error)
    else {
      toast.success(
        `Assigned ${res.updated} credential(s)${res.shortfall ? ` — only ${res.updated} were left` : ''}.`
      )
      setSelectedIds([])
      router.refresh()
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Assign Unassigned Credentials</h1>
        <p className="text-sm text-slate-500">
          Pick an upload batch date. Only credentials uploaded on that date and still
          unassigned can be assigned. Max 500 per click.
        </p>
      </div>

      {users.length === 0 && (
        <Card className="mb-4">
          <CardContent className="py-8 text-center text-slate-500">
            No user accounts found. Ask an admin to create a user first.
          </CardContent>
        </Card>
      )}

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Assignment Settings</CardTitle>
          <CardDescription>
            {remaining} unassigned credential(s) left in the {uploadDate} batch.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex gap-4 flex-wrap items-end">
          <div className="space-y-1">
            <Label>User</Label>
            <Select value={selectedUser} onValueChange={setSelectedUser}>
              <SelectTrigger className="w-full sm:w-56">
                <SelectValue placeholder="Select user" />
              </SelectTrigger>
              <SelectContent>
                {users.map(u => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.full_name || u.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label htmlFor="supervisor-upload-date">Upload date (batch)</Label>
            <div className="flex gap-2">
              <Input
                id="supervisor-upload-date"
                type="date"
                value={uploadDate}
                onChange={e => changeUploadDate(e.target.value)}
                className="w-44"
              />
              {availableDates.length > 0 && (
                <select
                  aria-label="Batches with unassigned credentials"
                  value={availableDates.includes(uploadDate) ? uploadDate : ''}
                  onChange={e => changeUploadDate(e.target.value)}
                  className="border rounded px-2 py-2 text-sm bg-white"
                >
                  <option value="">Batches…</option>
                  {availableDates.map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              )}
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="supervisor-assign-date">Assign date</Label>
            <Input
              id="supervisor-assign-date"
              type="date"
              value={assignDate}
              onChange={e => setAssignDate(e.target.value)}
              className="w-44"
            />
          </div>

          <div className="space-y-1">
            <Label>Search pool</Label>
            <Input
              placeholder="Search email…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full sm:w-56"
            />
          </div>

          <Button onClick={handleAssign} disabled={busy || selectedIds.length === 0 || !selectedUser}>
            {busy ? 'Assigning…' : `Assign Selected (${selectedIds.length})`}
          </Button>
        </CardContent>
      </Card>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Quick Assign (by quantity)</CardTitle>
          <CardDescription>
            Picks the oldest unassigned credentials from the {uploadDate} batch.
          </CardDescription>
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
          <Button onClick={handleQuickAssign} disabled={busy || !selectedUser}>
            {busy ? 'Assigning…' : `Auto-assign ${quickCount || 0} credentials`}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            Unassigned Pool — {uploadDate} ({filtered.length} shown / {pool.length} loaded)
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
                    <TableCell className="text-sm text-slate-500">{r.upload_date || '—'}</TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center py-6 text-slate-500">
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
