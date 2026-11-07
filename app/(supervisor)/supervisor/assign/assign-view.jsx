'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  supervisorAssignSelected,
  supervisorAssignNext,
  supervisorUnassign,
} from '@/app/actions/supervisor'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

const MAX_UNASSIGN = 50

export default function SupervisorAssignView({
  users,
  pool,
  pendingRows: initialPendingRows,
  uploadDate,
  assignDate: initialAssignDate,
  availableDates,
  remaining,
}) {
  const router = useRouter()
  const [poolRows, setPoolRows] = useState(pool)
  const [pendingRows, setPendingRows] = useState(initialPendingRows)
  const [selectedUser, setSelectedUser] = useState('')
  const [assignDate, setAssignDate] = useState(initialAssignDate)
  const [selectedIds, setSelectedIds] = useState([])
  const [selectedPendingIds, setSelectedPendingIds] = useState([])
  const [search, setSearch] = useState('')
  const [quickCount, setQuickCount] = useState('30')
  const [busy, setBusy] = useState(false)
  const [pendingBusy, setPendingBusy] = useState(false)

  const filtered = poolRows.filter(r =>
    !search.trim() || r.email.toLowerCase().includes(search.toLowerCase())
  )

  function changeUploadDate(value) {
    if (!value) return
    router.push(`/supervisor/assign?upload=${value}`)
  }

  function userLabel(userId) {
    const user = users.find(u => u.id === userId)
    return user?.full_name || user?.email || 'Unknown user'
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

  function togglePending(id) {
    setSelectedPendingIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  function toggleAllPending() {
    const ids = pendingRows.map(p => p.id)
    const all = ids.length > 0 && ids.every(id => selectedPendingIds.includes(id))
    setSelectedPendingIds(all ? [] : ids)
  }

  function addAssignedToPending(assignedRows) {
    if (assignedRows.length === 0) return
    setPendingRows(prev => {
      const existing = new Set(prev.map(row => row.id))
      return [...assignedRows.filter(row => !existing.has(row.id)), ...prev]
    })
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
    const ids = selectedIds
    const taken = poolRows.filter(row => ids.includes(row.id))
    setBusy(true)
    setPoolRows(prev => prev.filter(row => !ids.includes(row.id)))
    setSelectedIds([])

    const res = await supervisorAssignSelected(ids, selectedUser, assignDate, uploadDate)
    setBusy(false)
    if (res?.error) {
      setPoolRows(prev => [...taken, ...prev])
      toast.error(res.error)
      return
    }

    addAssignedToPending(taken.map(row => ({
      id: row.id,
      email: row.email,
      upload_date: row.upload_date,
      assign_date: assignDate,
      assigned_to: selectedUser,
      assigned_profile: {
        full_name: users.find(u => u.id === selectedUser)?.full_name || null,
        email: users.find(u => u.id === selectedUser)?.email || null,
      },
    })))
    toast.success(`Assigned ${res.updated} credential(s).`)
    router.refresh()
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

  async function handleUnassign() {
    if (selectedPendingIds.length === 0) return
    if (selectedPendingIds.length > MAX_UNASSIGN) {
      toast.error(`Max ${MAX_UNASSIGN} per action. Selected: ${selectedPendingIds.length}`)
      return
    }
    if (!confirm(`Unassign ${selectedPendingIds.length} pending credential(s)?`)) return

    const ids = selectedPendingIds
    const snapshot = pendingRows
    const taken = snapshot.filter(row => ids.includes(row.id))
    setPendingBusy(true)
    setPendingRows(prev => prev.filter(row => !ids.includes(row.id)))
    setSelectedPendingIds([])

    const res = await supervisorUnassign(ids)
    setPendingBusy(false)

    if (res?.error) {
      setPendingRows(snapshot)
      toast.error(res.error)
      return
    }

    // Rows from the currently open upload batch go straight back into the pool.
    const returned = taken
      .filter(row => row.upload_date === uploadDate)
      .map(row => ({ id: row.id, email: row.email, upload_date: row.upload_date }))
    if (returned.length > 0) {
      setPoolRows(prev => {
        const existing = new Set(prev.map(row => row.id))
        return [...returned.filter(row => !existing.has(row.id)), ...prev]
      })
    }

    toast.success(`Unassigned ${res.updated} pending credential(s).`)
    if (res.skipped) toast.message(`${res.skipped} row(s) were skipped (not pending or not yours).`)
    router.refresh()
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

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Your Pending Assignments</CardTitle>
          <CardDescription>
            Take back pending credentials you assigned. Done/error rows cannot be unassigned.
            Max {MAX_UNASSIGN} per action.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {pendingRows.length === 0 ? (
            <p className="text-sm text-slate-500 py-4 text-center">
              No pending credentials assigned by you.
            </p>
          ) : (
            <>
              <div className="flex gap-2 items-center flex-wrap mb-3">
                <Button
                  variant="destructive"
                  onClick={handleUnassign}
                  disabled={pendingBusy || selectedPendingIds.length === 0}
                >
                  {pendingBusy ? 'Unassigning…' : `Unassign Selected (${selectedPendingIds.length})`}
                </Button>
                <span className="text-xs text-slate-500">
                  {pendingRows.length} pending row(s) loaded
                </span>
              </div>
              <div className="max-h-96 overflow-auto border rounded">
                <Table>
                  <TableHeader className="sticky top-0 bg-white z-10">
                    <TableRow>
                      <TableHead className="w-12">
                        <Checkbox
                          checked={
                            pendingRows.length > 0 &&
                            pendingRows.every(r => selectedPendingIds.includes(r.id))
                          }
                          onCheckedChange={toggleAllPending}
                        />
                      </TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead>Assign Date</TableHead>
                      <TableHead>Upload Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingRows.map(row => (
                      <TableRow key={row.id} className={selectedPendingIds.includes(row.id) ? 'bg-blue-50' : ''}>
                        <TableCell>
                          <Checkbox
                            checked={selectedPendingIds.includes(row.id)}
                            onCheckedChange={() => togglePending(row.id)}
                          />
                        </TableCell>
                        <TableCell className="font-mono text-sm">{row.email}</TableCell>
                        <TableCell>
                          {row.assigned_profile?.full_name ||
                            row.assigned_profile?.email ||
                            userLabel(row.assigned_to)}
                        </TableCell>
                        <TableCell className="text-sm whitespace-nowrap">{row.assign_date || '—'}</TableCell>
                        <TableCell className="text-sm whitespace-nowrap">{row.upload_date || '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            Unassigned Pool — {uploadDate} ({filtered.length} shown / {poolRows.length} loaded)
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
                    <TableCell className="text-sm text-slate-500 whitespace-nowrap">{r.upload_date || '—'}</TableCell>
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
