'use client'

import { useEffect, useMemo, useState } from 'react'
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

function dateCacheKey(userId, date) {
  return cacheKey('user', userId, 'date', date)
}

function CopyCell({ value, masked = false }) {
  const [flash, setFlash] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setFlash(true)
      toast.success(masked ? 'Password copied' : 'Email copied')
      setTimeout(() => setFlash(false), 600)
    } catch {
      toast.error('Copy failed')
    }
  }
  return (
    <button
      type="button"
      onClick={copy}
      title="Click to copy"
      className={`text-left w-full font-mono text-sm px-2 py-1 rounded transition break-all ${
        flash ? 'bg-green-100' : 'hover:bg-slate-100'
      }`}
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

export default function TasksView({ userId, userEmail, dates, initialDate, initialRows }) {
  const supabase = useMemo(() => createClient(), [])
  const [selectedDate, setSelectedDate] = useState(initialDate)
  const [rowsByDate, setRowsByDate] = useState(() =>
    initialDate ? { [initialDate]: initialRows } : {}
  )
  const [loadingDate, setLoadingDate] = useState(null)
  const [selectedIds, setSelectedIds] = useState([])
  const [filterStatus, setFilterStatus] = useState('all')
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(false)

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
    const next = data ?? []
    setRowsByDate(previous => ({ ...previous, [date]: next }))
    cacheSet(dateCacheKey(userId, date), next, CACHE_TTL)
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
    if (rowsByDate[nextDate]) return

    const cached = cacheGet(dateCacheKey(userId, nextDate), { allowStale: true })
    if (cached) {
      setRowsByDate(previous => ({ ...previous, [nextDate]: cached }))
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

  async function applyStatus(ids, newStatus) {
    if (ids.length === 0 || busy || !selectedDate) return
    const current = rowsByDate[selectedDate] ?? []
    const idSet = new Set(ids)
    const completedAt = newStatus === 'pending' ? null : new Date().toISOString()
    const optimistic = current.map(row =>
      idSet.has(row.id) ? { ...row, status: newStatus, completed_at: completedAt } : row
    )

    setBusy(true)
    setRowsByDate(previous => ({ ...previous, [selectedDate]: optimistic }))
    cacheSet(dateCacheKey(userId, selectedDate), optimistic, CACHE_TTL)
    setSelectedIds([])

    const res = await updateStatus(ids, newStatus)
    setBusy(false)

    if (res?.error) {
      setRowsByDate(previous => ({ ...previous, [selectedDate]: current }))
      cacheSet(dateCacheKey(userId, selectedDate), current, CACHE_TTL)
      toast.error(res.error)
    } else {
      toast.success(`Saved ${res.updated} item(s) → ${newStatus}`)
    }
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
          {busy && <span className="text-xs text-slate-500">Saving…</span>}
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
                  <TableRow key={r.id} className={selectedIds.includes(r.id) ? 'bg-blue-50' : ''}>
                    <TableCell>
                      <Checkbox checked={selectedIds.includes(r.id)} onCheckedChange={() => toggleOne(r.id)} />
                    </TableCell>
                    <TableCell className="p-0"><CopyCell value={r.email} /></TableCell>
                    <TableCell className="p-0"><CopyCell value={r.password} masked /></TableCell>
                    <TableCell><StatusBadge status={r.status} verified={r.verified_status} /></TableCell>
                    <TableCell>
                      <Select value={r.status} onValueChange={(v) => applyStatus([r.id], v)}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending">Pending</SelectItem>
                          <SelectItem value="done">Done</SelectItem>
                          <SelectItem value="error">Error</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
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
          <span className="text-sm">{selectedIds.length} selected</span>
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" variant="secondary" onClick={() => applyStatus(selectedIds, 'done')} disabled={busy}>
              Mark Done
            </Button>
            <Button size="sm" variant="secondary" onClick={() => applyStatus(selectedIds, 'error')} disabled={busy}>
              Mark Error
            </Button>
            <Button size="sm" variant="secondary" onClick={() => applyStatus(selectedIds, 'pending')} disabled={busy}>
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
