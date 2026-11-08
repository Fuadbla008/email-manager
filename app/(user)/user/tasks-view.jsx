'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { CheckCircle2, XCircle, Clock, Loader2 } from 'lucide-react'
import { updateStatus } from '@/app/actions/user'
import { createClient } from '@/lib/supabase/client'
import { cacheGet, cacheKey, cacheSet } from '@/lib/client-cache'
import CompletionBar from '@/components/completion-bar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

const CACHE_TTL = 10 * 60 * 1000
const ROW_SELECT = 'id, email, password, status, verified_status, completed_at'

// The email cell is tinted with the row's current status. Pending is yellow,
// done is green and error is red, so the table is scannable at a glance.
const STATUS_BG = {
  pending: 'bg-yellow-100',
  done: 'bg-green-100',
  error: 'bg-red-100',
}

const STATUS_BORDER = {
  pending: 'border-l-yellow-400',
  done: 'border-l-green-400',
  error: 'border-l-red-400',
}

function dateCacheKey(userId, date) {
  return cacheKey('user', userId, 'date', date)
}

function CopyCell({ value, masked = false, onCopied, flash = false, className = '' }) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      onCopied?.()
      toast.success(masked ? 'Password copied' : 'Email copied', { duration: 1200 })
    } catch {
      toast.error('Copy failed')
    }
  }
  return (
    <button
      type="button"
      onClick={copy}
      title="Click to copy"
      className={`text-left w-full font-mono text-sm px-2 py-1 rounded transition-colors duration-200 break-all ${
        flash ? 'bg-green-200 text-green-900' : 'hover:bg-slate-100'
      } ${className}`}
    >
      {masked ? '••••••••' : value}
    </button>
  )
}

function StatusBadge({ status, verified }) {
  const colorMap = {
    pending: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    done: 'bg-green-100 text-green-800 border-green-200',
    error: 'bg-red-100 text-red-800 border-red-200',
  }
  return (
    <div className="flex gap-1 flex-wrap">
      <Badge variant="outline" className={colorMap[status]}>{status}</Badge>
      {verified && verified !== status && (
        <Badge variant="outline" className="bg-orange-100 text-orange-800 border-orange-200">
          verified: {verified}
        </Badge>
      )}
      {verified && verified === status && (
        <Badge variant="outline" className="bg-blue-100 text-blue-800 border-blue-200">
          verified ✓
        </Badge>
      )}
    </div>
  )
}

function TaskRow({ row, selected, saving, onToggle, onStatusChange }) {
  const [copied, setCopied] = useState(null)
  const timer = useRef(null)

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  function markCopied(field) {
    setCopied(field)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopied(null), 800)
  }

  // Copying either the email or the password flashes the email cell green,
  // which makes it obvious which row was just picked up.
  const emailFlash = copied === 'email' || copied === 'password'
  const passwordFlash = copied === 'password'

  return (
    <TableRow className={selected ? 'bg-blue-50' : ''}>
      <TableCell>
        <Checkbox checked={selected} onCheckedChange={onToggle} />
      </TableCell>
      <TableCell
        className={`p-0 border-l-4 ${STATUS_BORDER[row.status] ?? 'border-l-transparent'}`}
      >
        <CopyCell
          value={row.email}
          onCopied={() => markCopied('email')}
          flash={emailFlash}
          className={emailFlash ? '' : (STATUS_BG[row.status] ?? '')}
        />
      </TableCell>
      <TableCell className="p-0">
        <CopyCell
          value={row.password}
          masked
          onCopied={() => markCopied('password')}
          flash={passwordFlash}
        />
      </TableCell>
      <TableCell><StatusBadge status={row.status} verified={row.verified_status} /></TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <Select value={row.status} onValueChange={onStatusChange} disabled={saving}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="done">Done</SelectItem>
              <SelectItem value="error">Error</SelectItem>
            </SelectContent>
          </Select>
          {saving && <Loader2 size={14} className="animate-spin text-slate-400" />}
        </div>
      </TableCell>
    </TableRow>
  )
}

export default function TasksView({ userId, userEmail, dates, initialDate, initialRows }) {
  const supabase = useMemo(() => createClient(), [])
  const [selectedDate, setSelectedDate] = useState(initialDate)
  // Both start from the same server payload. The ref is the synchronous source
  // of truth for event handlers; the state drives rendering. `commitDateRows`
  // keeps them in lockstep after every change.
  const [rowsByDate, setRowsByDate] = useState(() =>
    initialDate ? { [initialDate]: initialRows } : {}
  )
  const rowsRef = useRef(initialDate ? { [initialDate]: initialRows } : {})
  const [loadingDate, setLoadingDate] = useState(null)
  const [selectedIds, setSelectedIds] = useState([])
  const [filterStatus, setFilterStatus] = useState('all')
  const [search, setSearch] = useState('')
  const savingRef = useRef(new Set())
  const [savingIds, setSavingIds] = useState(() => new Set())

  const rows = useMemo(
    () => (selectedDate ? rowsByDate[selectedDate] ?? [] : []),
    [selectedDate, rowsByDate]
  )

  // Warm the browser cache for the other dates in the background. Switching
  // dates later becomes instant instead of waiting for Supabase again.
  useEffect(() => {
    if (!userId || dates.length <= 1) return
    let cancelled = false

    async function prefetch() {
      const missing = dates.filter(
        date => date !== initialDate && !cacheGet(dateCacheKey(userId, date), { allowStale: true })
      )
      for (let i = 0; i < missing.length; i += 3) {
        await Promise.all(
          missing.slice(i, i + 3).map(async date => {
            const { data } = await supabase
              .from('email_credentials')
              .select(ROW_SELECT)
              .eq('assigned_to', userId)
              .eq('assign_date', date)
              .order('created_at', { ascending: true })
            if (!cancelled && data) cacheSet(dateCacheKey(userId, date), data, CACHE_TTL)
          })
        )
      }
    }

    prefetch()
    return () => { cancelled = true }
  }, [dates, initialDate, userId, supabase])

  // Keep the ref, React state and session cache in lockstep. Doing this in one
  // helper means concurrent optimistic updates never read a stale snapshot.
  function commitDateRows(date, nextRows) {
    rowsRef.current = { ...rowsRef.current, [date]: nextRows }
    setRowsByDate(rowsRef.current)
    cacheSet(dateCacheKey(userId, date), nextRows, CACHE_TTL)
  }

  function setSaving(ids, saving) {
    const next = new Set(savingRef.current)
    ids.forEach(id => {
      if (saving) next.add(id)
      else next.delete(id)
    })
    savingRef.current = next
    setSavingIds(next)
  }

  async function loadDate(date) {
    setLoadingDate(date)
    const { data, error } = await supabase
      .from('email_credentials')
      .select(ROW_SELECT)
      .eq('assigned_to', userId)
      .eq('assign_date', date)
      .order('created_at', { ascending: true })

    setLoadingDate(current => (current === date ? null : current))
    if (error) {
      toast.error(error.message)
      return
    }
    commitDateRows(date, data ?? [])
  }

  function changeDate(nextDate) {
    if (!nextDate || nextDate === selectedDate) return
    setSelectedDate(nextDate)
    setSelectedIds([])
    setFilterStatus('all')
    setSearch('')
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', `/user?date=${nextDate}`)
    }
    if (rowsRef.current[nextDate]) return

    const cached = cacheGet(dateCacheKey(userId, nextDate), { allowStale: true })
    if (cached) {
      commitDateRows(nextDate, cached)
      return
    }
    loadDate(nextDate)
  }

  const stats = useMemo(() => {
    const s = { total: rows.length, pending: 0, done: 0, error: 0 }
    rows.forEach(r => { if (s[r.status] !== undefined) s[r.status]++ })
    return s
  }, [rows])

  const filtered = useMemo(() => {
    return rows.filter(r => {
      if (filterStatus !== 'all' && r.status !== filterStatus) return false
      if (search && !r.email.toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
  }, [rows, filterStatus, search])

  function toggleOne(id) {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  function toggleAll() {
    const ids = filtered.map(r => r.id)
    const all = ids.length > 0 && ids.every(id => selectedIds.includes(id))
    if (all) setSelectedIds(prev => prev.filter(id => !ids.includes(id)))
    else setSelectedIds(prev => Array.from(new Set([...prev, ...ids])))
  }

  /**
   * Optimistic + concurrent status update.
   *
   * Every row gets its own in-flight marker, so changing one row never blocks
   * another. If a request fails, only the rows from that request are rolled
   * back — other in-flight/successful changes are left untouched.
   */
  async function applyStatus(ids, newStatus) {
    if (!selectedDate) return
    const date = selectedDate
    const unique = Array.from(new Set(ids)).filter(id => !savingRef.current.has(id))
    if (unique.length === 0) return

    const current = rowsRef.current[date] ?? []
    const idSet = new Set(unique)
    const previous = new Map()
    current.forEach(row => {
      if (idSet.has(row.id)) previous.set(row.id, row)
    })
    if (previous.size === 0) return

    const completedAt = newStatus === 'pending' ? null : new Date().toISOString()
    const optimistic = current.map(row =>
      idSet.has(row.id) ? { ...row, status: newStatus, completed_at: completedAt } : row
    )

    commitDateRows(date, optimistic)
    setSaving(unique, true)
    setSelectedIds(prev => prev.filter(id => !idSet.has(id)))

    const res = await updateStatus(unique, newStatus)
    setSaving(unique, false)

    if (res?.error) {
      revertRows(date, idSet, previous, newStatus, completedAt)
      toast.error(res.error, { duration: 3500 })
      return
    }

    // The server may have skipped rows that no longer belong to the user.
    const updatedSet = new Set(res.updatedIds ?? unique)
    if (updatedSet.size !== unique.length) {
      revertRows(date, idSet, previous, newStatus, completedAt, updatedSet)
    }

    toast.success(
      unique.length === 1
        ? `Marked ${newStatus}`
        : `${res.updated} item(s) → ${newStatus}`,
      { id: `status-${date}-${newStatus}`, duration: 1400 }
    )
  }

  function revertRows(date, idSet, previous, newStatus, completedAt, keep = null) {
    const latest = rowsRef.current[date] ?? []
    let changed = false
    const reverted = latest.map(row => {
      if (!idSet.has(row.id)) return row
      if (keep && keep.has(row.id)) return row
      // Only revert a row that still shows this request's optimistic value,
      // so a newer user action is never overwritten.
      if (row.status !== newStatus || row.completed_at !== completedAt) return row
      const before = previous.get(row.id)
      if (!before) return row
      changed = true
      return { ...row, status: before.status, completed_at: before.completed_at }
    })
    if (changed) commitDateRows(date, reverted)
  }

  const pendingSelected = selectedIds.filter(id => !savingIds.has(id))

  if (dates.length === 0) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-2">My Tasks</h1>
        <p className="text-sm text-slate-500 mb-6">Welcome, {userEmail}</p>
        <Card>
          <CardContent className="py-12 text-center text-slate-500">
            No assignments yet. Wait for admin to assign credentials to you.
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="pb-24">
      <h1 className="text-2xl font-bold mb-2">My Tasks</h1>
      <p className="text-sm text-slate-500 mb-6">Welcome, {userEmail}</p>

      <Card className="mb-4">
        <CardContent className="pt-4 flex items-center gap-3 flex-wrap">
          <label className="text-sm font-medium">Date:</label>
          <Select value={selectedDate ?? ''} onValueChange={changeDate}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Select date" /></SelectTrigger>
            <SelectContent>
              {dates.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
            </SelectContent>
          </Select>
          {loadingDate === selectedDate && (
            <span className="text-xs text-slate-500 flex items-center gap-1">
              <Loader2 size={12} className="animate-spin" /> Loading this date…
            </span>
          )}
          {savingIds.size > 0 && (
            <span className="text-xs text-slate-500 flex items-center gap-1">
              <Loader2 size={12} className="animate-spin" /> Saving {savingIds.size}…
            </span>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-slate-500">Total</div>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-slate-500 flex items-center gap-1"><Clock size={12} /> Pending</div>
            <div className="text-2xl font-bold text-yellow-600">{stats.pending}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-slate-500 flex items-center gap-1"><CheckCircle2 size={12} /> Done</div>
            <div className="text-2xl font-bold text-green-600">{stats.done}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-slate-500 flex items-center gap-1"><XCircle size={12} /> Error</div>
            <div className="text-2xl font-bold text-red-600">{stats.error}</div>
          </CardContent>
        </Card>
      </div>

      <Card className="mb-4">
        <CardContent className="pt-4">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-2 gap-2">
            <span>Completion</span>
            <span>{stats.done + stats.error} of {stats.total} finished</span>
          </div>
          <CompletionBar done={stats.done} error={stats.error} total={stats.total} />
        </CardContent>
      </Card>

      <Card className="mb-4">
        <CardContent className="pt-4 flex flex-col md:flex-row gap-3 md:items-center">
          <div className="flex gap-1 flex-wrap">
            {[
              { key: 'all', label: 'All', count: stats.total },
              { key: 'pending', label: 'Pending', count: stats.pending },
              { key: 'done', label: 'Done', count: stats.done },
              { key: 'error', label: 'Error', count: stats.error },
            ].map(t => (
              <button
                key={t.key}
                onClick={() => setFilterStatus(t.key)}
                className={`px-3 py-1 rounded text-sm border transition ${
                  filterStatus === t.key
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white hover:bg-slate-50'
                }`}
              >
                {t.label} ({t.count})
              </button>
            ))}
          </div>
          <div className="md:ml-auto w-full md:w-auto">
            <Input
              placeholder="Search email…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full md:w-64"
            />
          </div>
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
                      checked={filtered.length > 0 && filtered.every(r => selectedIds.includes(r.id))}
                      onCheckedChange={toggleAll}
                    />
                  </TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Password</TableHead>
                  <TableHead className="w-44">Status</TableHead>
                  <TableHead className="w-32">Change</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(r => (
                  <TaskRow
                    key={r.id}
                    row={r}
                    selected={selectedIds.includes(r.id)}
                    saving={savingIds.has(r.id)}
                    onToggle={() => toggleOne(r.id)}
                    onStatusChange={(value) => applyStatus([r.id], value)}
                  />
                ))}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-slate-500">
                      {loadingDate === selectedDate ? 'Loading…' : 'No items match.'}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {selectedIds.length > 0 && (
        <div className="fixed bottom-0 left-0 md:left-64 right-0 bg-slate-900 text-white py-3 px-3 md:px-6 flex flex-wrap gap-2 items-center justify-between shadow-lg z-20">
          <span className="text-sm">
            {selectedIds.length} selected
            {savingIds.size > 0 && ` · ${savingIds.size} saving`}
          </span>
          <div className="flex gap-2 flex-wrap">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => applyStatus(pendingSelected, 'done')}
              disabled={pendingSelected.length === 0}
            >
              Mark Done
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => applyStatus(pendingSelected, 'error')}
              disabled={pendingSelected.length === 0}
            >
              Mark Error
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => applyStatus(pendingSelected, 'pending')}
              disabled={pendingSelected.length === 0}
            >
              Mark Pending
            </Button>
            <Button size="sm" variant="ghost" className="text-white hover:bg-slate-800" onClick={() => setSelectedIds([])}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
