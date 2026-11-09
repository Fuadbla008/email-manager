'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { CheckCircle2, XCircle, Clock, Loader2, CloudUpload } from 'lucide-react'
import { updateStatus } from '@/app/actions/user'
import { createClient } from '@/lib/supabase/client'
import { cacheGet, cacheKey, cacheSet } from '@/lib/client-cache'
import {
  applyPending,
  enqueueStatus,
  pendingEntries,
  readQueue,
  removePendingIfUnchanged,
} from '@/lib/pending-status'
import CompletionBar from '@/components/completion-bar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

const CACHE_TTL = 10 * 60 * 1000
const ROW_SELECT =
  'id, email, password, status, verified_status, completed_at, error_number_verify, error_locked'
const FLUSH_CHUNK = 500

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

function ErrorFlags({ row, onFlagChange }) {
  if (row.status !== 'error') return null
  return (
    <div className="mt-2 space-y-1">
      <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer select-none">
        <Checkbox
          checked={!!row.error_number_verify}
          onCheckedChange={checked => onFlagChange('error_number_verify', checked === true)}
        />
        Number verify
      </label>
      <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer select-none">
        <Checkbox
          checked={!!row.error_locked}
          onCheckedChange={checked => onFlagChange('error_locked', checked === true)}
        />
        Locked
      </label>
    </div>
  )
}

function TaskRow({ row, selected, pending, onToggle, onStatusChange, onFlagChange }) {
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
      <TableCell className="w-48">
        <div className="flex items-center gap-2">
          <Select value={row.status} onValueChange={onStatusChange}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="done">Done</SelectItem>
              <SelectItem value="error">Error</SelectItem>
            </SelectContent>
          </Select>
          {pending && <Loader2 size={14} className="animate-spin text-slate-400" />}
        </div>
        <ErrorFlags row={row} onFlagChange={onFlagChange} />
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
  const [pendingIds, setPendingIds] = useState(() => new Set())

  // Background sync state. `busy` prevents overlapping flushes; `dirty` means
  // a new change arrived while a flush was in flight, so run again after it.
  const flushRef = useRef({ busy: false, dirty: false, attempt: 0 })
  const retryTimer = useRef(null)

  const rows = useMemo(
    () => (selectedDate ? rowsByDate[selectedDate] ?? [] : []),
    [selectedDate, rowsByDate]
  )

  // Keep the ref, React state and session cache in lockstep. Doing this in one
  // helper means concurrent optimistic updates never read a stale snapshot.
  function commitDateRows(date, nextRows) {
    rowsRef.current = { ...rowsRef.current, [date]: nextRows }
    setRowsByDate(rowsRef.current)
    cacheSet(dateCacheKey(userId, date), nextRows, CACHE_TTL)
  }

  function scheduleRetry() {
    if (retryTimer.current) return
    const attempt = flushRef.current.attempt
    const delay = Math.min(5000 * 2 ** attempt, 120000)
    flushRef.current.attempt = Math.min(attempt + 1, 5)
    retryTimer.current = setTimeout(() => {
      retryTimer.current = null
      flushQueue()
    }, delay)
  }

  function clearRetry() {
    if (retryTimer.current) {
      clearTimeout(retryTimer.current)
      retryTimer.current = null
    }
  }

  function revertSkipped(snapshot, skippedIds) {
    if (skippedIds.size === 0) return
    const next = { ...rowsRef.current }
    const changedDates = []

    for (const date of Object.keys(next)) {
      const current = next[date]
      let changed = false
      const mapped = current.map(row => {
        if (!skippedIds.has(row.id)) return row
        const entry = snapshot[row.id]
        if (!entry?.prev) return row
        changed = true
        return {
          ...row,
          status: entry.prev.status,
          error_number_verify: !!entry.prev.error_number_verify,
          error_locked: !!entry.prev.error_locked,
          completed_at: entry.prev.completed_at ?? null,
        }
      })
      if (changed) {
        next[date] = mapped
        changedDates.push(date)
      }
    }

    if (changedDates.length > 0) {
      rowsRef.current = next
      setRowsByDate(next)
      changedDates.forEach(date =>
        cacheSet(dateCacheKey(userId, date), next[date], CACHE_TTL)
      )
    }
  }

  /**
   * Send the localStorage queue to the server.
   *
   * The UI never waits for this: changes are already in localStorage and on
   * screen. Confirmed rows leave the queue; failed rows stay for a retry.
   */
  async function flushQueue() {
    if (!userId) return
    if (flushRef.current.busy) {
      flushRef.current.dirty = true
      return
    }

    const snapshot = readQueue(userId)
    const entries = Object.values(snapshot).slice(0, FLUSH_CHUNK)
    if (entries.length === 0) return

    flushRef.current.busy = true
    flushRef.current.dirty = false
    let continueFlush = false
    let failed = false

    try {
      const res = await updateStatus(
        entries.map(entry => ({
          id: entry.id,
          status: entry.status,
          error_number_verify: entry.error_number_verify,
          error_locked: entry.error_locked,
        }))
      )

      if (!res) {
        failed = true
        toast.error('Could not save changes. They are kept on this device.', {
          id: 'status-sync-error',
          duration: 3000,
        })
        scheduleRetry()
        return
      }

      // Skipped rows are no longer assigned to this user. Remove them from the
      // queue and roll the UI back before deciding whether a retry is needed.
      let skippedCount = 0
      if (res.skippedIds?.length) {
        const removedSkipped = removePendingIfUnchanged(userId, snapshot, res.skippedIds)
        skippedCount = removedSkipped.length
        if (removedSkipped.length > 0) {
          setPendingIds(prev => {
            const next = new Set(prev)
            removedSkipped.forEach(id => next.delete(id))
            return next
          })
          revertSkipped(snapshot, new Set(removedSkipped))
        }
        toast.error('Some items are no longer assigned to you; those changes were not saved.', {
          id: 'status-sync-skipped',
          duration: 4000,
        })
      }

      const updatedIds = res.updatedIds ?? []
      if (res.error && updatedIds.length === 0) {
        // If every entry was rejected as unowned, there is nothing left to
        // retry; otherwise keep the queue for the next attempt.
        if (skippedCount < entries.length) {
          failed = true
          toast.error(res.error, { id: 'status-sync-error', duration: 3000 })
          scheduleRetry()
        } else {
          flushRef.current.attempt = 0
          clearRetry()
        }
        return
      }

      const removed = removePendingIfUnchanged(userId, snapshot, updatedIds)
      if (removed.length > 0) {
        setPendingIds(prev => {
          const next = new Set(prev)
          removed.forEach(id => next.delete(id))
          return next
        })
      }

      if (res.error) {
        failed = true
        toast.error(res.error, { id: 'status-sync-error', duration: 3000 })
        scheduleRetry()
      } else {
        flushRef.current.attempt = 0
        clearRetry()
        const saved = (res.updatedIds ?? []).length
        if (saved > 0) {
          toast.success(saved === 1 ? 'Change saved' : `${saved} changes saved`, {
            id: 'status-sync',
            duration: 1200,
          })
        }
        continueFlush =
          entries.length === FLUSH_CHUNK && pendingEntries(userId).length > 0
      }
    } catch {
      failed = true
      toast.error('Saved on this device. Will retry when the connection is back.', {
        id: 'status-sync-offline',
        duration: 3000,
      })
      scheduleRetry()
    } finally {
      flushRef.current.busy = false
      if ((flushRef.current.dirty && !failed) || continueFlush) flushQueue()
    }
  }

  /**
   * Optimistic write: update the screen, persist to localStorage, then flush.
   * Every row is independent, so a slow request never blocks another row.
   */
  function commitUpdates(date, updates) {
    const current = rowsRef.current[date] ?? []
    const byId = new Map(updates.map(update => [update.id, update]))
    let changed = false

    const next = current.map(row => {
      const update = byId.get(row.id)
      if (!update) return row
      changed = true
      return {
        ...row,
        status: update.status,
        error_number_verify: update.error_number_verify,
        error_locked: update.error_locked,
        completed_at:
          update.status === 'pending'
            ? null
            : (row.completed_at ?? new Date().toISOString()),
      }
    })

    if (changed) commitDateRows(date, next)

    updates.forEach(update => enqueueStatus(userId, update))
    setPendingIds(prev => {
      const nextSet = new Set(prev)
      updates.forEach(update => nextSet.add(update.id))
      return nextSet
    })
    flushQueue()
  }

  // Re-apply the localStorage queue on mount (e.g. after a reload mid-sync) and
  // then resume sending it to the server.
  useEffect(() => {
    if (!userId) return
    let cancelled = false

    async function hydrate() {
      await Promise.resolve()
      if (cancelled) return

      const queue = readQueue(userId)
      const ids = new Set(Object.keys(queue))
      if (ids.size === 0) return

      setPendingIds(ids)

      const next = { ...rowsRef.current }
      const changedDates = []
      for (const date of Object.keys(next)) {
        const applied = applyPending(next[date], queue)
        if (applied !== next[date]) {
          next[date] = applied
          changedDates.push(date)
        }
      }
      if (changedDates.length > 0) {
        rowsRef.current = next
        setRowsByDate(next)
        changedDates.forEach(date =>
          cacheSet(dateCacheKey(userId, date), next[date], CACHE_TTL)
        )
      }

      flushQueue()
    }

    hydrate()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  // Retry as soon as the browser is online again or the tab becomes visible.
  useEffect(() => {
    function handleOnline() { flushQueue() }
    function handleVisible() {
      if (document.visibilityState === 'visible') flushQueue()
    }
    window.addEventListener('online', handleOnline)
    document.addEventListener('visibilitychange', handleVisible)
    return () => {
      window.removeEventListener('online', handleOnline)
      document.removeEventListener('visibilitychange', handleVisible)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => () => clearRetry(), [])

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
            if (!cancelled && data) {
              cacheSet(dateCacheKey(userId, date), applyPending(data, readQueue(userId)), CACHE_TTL)
            }
          })
        )
      }
    }

    prefetch()
    return () => { cancelled = true }
  }, [dates, initialDate, userId, supabase])

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
    commitDateRows(date, applyPending(data ?? [], readQueue(userId)))
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
      commitDateRows(nextDate, applyPending(cached, readQueue(userId)))
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

  function applyStatus(ids, newStatus) {
    if (!selectedDate) return
    const date = selectedDate
    const current = rowsRef.current[date] ?? []
    const idSet = new Set(ids)
    const isError = newStatus === 'error'
    const updates = []

    current.forEach(row => {
      if (!idSet.has(row.id)) return

      // Keep flags when a row is already an error; reset them for any other
      // status. Non-error rows never carry error flags.
      const keepFlags = row.status === 'error'
      const nextNumber = isError && keepFlags ? !!row.error_number_verify : false
      const nextLocked = isError && keepFlags ? !!row.error_locked : false

      const unchanged =
        row.status === newStatus &&
        !!row.error_number_verify === nextNumber &&
        !!row.error_locked === nextLocked
      if (unchanged) return

      updates.push({
        id: row.id,
        status: newStatus,
        error_number_verify: nextNumber,
        error_locked: nextLocked,
        prev: {
          status: row.status,
          error_number_verify: !!row.error_number_verify,
          error_locked: !!row.error_locked,
          completed_at: row.completed_at ?? null,
        },
      })
    })

    if (updates.length === 0) return
    commitUpdates(date, updates)
    setSelectedIds(prev => prev.filter(id => !idSet.has(id)))
  }

  function applyFlags(row, field, value) {
    if (!selectedDate || row.status !== 'error') return
    const date = selectedDate
    const current = rowsRef.current[date] ?? []
    const target = current.find(r => r.id === row.id)
    if (!target) return

    const nextNumber = field === 'error_number_verify' ? value : !!target.error_number_verify
    const nextLocked = field === 'error_locked' ? value : !!target.error_locked
    if (nextNumber === !!target.error_number_verify && nextLocked === !!target.error_locked) {
      return
    }

    commitUpdates(date, [{
      id: target.id,
      status: 'error',
      error_number_verify: nextNumber,
      error_locked: nextLocked,
      prev: {
        status: target.status,
        error_number_verify: !!target.error_number_verify,
        error_locked: !!target.error_locked,
        completed_at: target.completed_at ?? null,
      },
    }])
  }

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
          {pendingIds.size > 0 && (
            <span className="text-xs text-slate-500 flex items-center gap-1">
              <CloudUpload size={12} className="animate-pulse" /> Syncing {pendingIds.size}…
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
                  <TableHead className="w-48">Change</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(r => (
                  <TaskRow
                    key={r.id}
                    row={r}
                    selected={selectedIds.includes(r.id)}
                    pending={pendingIds.has(r.id)}
                    onToggle={() => toggleOne(r.id)}
                    onStatusChange={(value) => applyStatus([r.id], value)}
                    onFlagChange={(field, value) => applyFlags(r, field, value)}
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
            {pendingIds.size > 0 && ` · ${pendingIds.size} syncing`}
          </span>
          <div className="flex gap-2 flex-wrap">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => applyStatus(selectedIds, 'done')}
            >
              Mark Done
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => applyStatus(selectedIds, 'error')}
            >
              Mark Error
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => applyStatus(selectedIds, 'pending')}
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
