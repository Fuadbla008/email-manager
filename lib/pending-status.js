/**
 * localStorage-backed queue for credential status changes.
 *
 * The user task table writes a change here first, then flushes it to the server
 * in the background. If the tab is closed or the network drops before the
 * server confirms, the entry survives a reload and is retried.
 *
 * Only non-sensitive fields (row id, status, error flags) are stored. Emails and
 * passwords never touch localStorage.
 */

const PREFIX = 'email-mgr:pending-status:v1:'

function getStore() {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

function storageKey(userId) {
  return PREFIX + userId
}

function makeRev() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function readQueue(userId) {
  const store = getStore()
  if (!store || !userId) return {}
  try {
    const raw = store.getItem(storageKey(userId))
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed
  } catch {
    return {}
  }
}

function writeQueue(userId, queue) {
  const store = getStore()
  if (!store || !userId) return
  try {
    if (Object.keys(queue).length === 0) store.removeItem(storageKey(userId))
    else store.setItem(storageKey(userId), JSON.stringify(queue))
  } catch {
    // Storage can be full or disabled. The app must keep working.
  }
}

export function pendingEntries(userId) {
  return Object.values(readQueue(userId))
}

/**
 * Upsert one row's pending change. `prev` is only used when this is the first
 * queued change for the row; later changes keep the original server value so a
 * rejected write can be reverted.
 */
export function enqueueStatus(userId, update) {
  const queue = readQueue(userId)
  const existing = queue[update.id]
  const prev = existing?.prev ?? update.prev ?? {
    status: update.status,
    error_number_verify: !!update.error_number_verify,
    error_locked: !!update.error_locked,
    completed_at: null,
  }

  queue[update.id] = {
    id: update.id,
    status: update.status,
    error_number_verify: !!update.error_number_verify,
    error_locked: !!update.error_locked,
    prev: {
      status: prev.status,
      error_number_verify: !!prev.error_number_verify,
      error_locked: !!prev.error_locked,
      completed_at: prev.completed_at ?? null,
    },
    rev: makeRev(),
    updatedAt: Date.now(),
  }

  writeQueue(userId, queue)
  return queue
}

/**
 * Remove only the entries that have not changed since the request snapshot.
 * This prevents a slow response from deleting a newer change made while the
 * request was in flight.
 */
export function removePendingIfUnchanged(userId, snapshot, ids) {
  const queue = readQueue(userId)
  const removed = []
  ids.forEach(id => {
    const sent = snapshot[id]
    if (sent && queue[id] && queue[id].rev === sent.rev) {
      delete queue[id]
      removed.push(id)
    }
  })
  if (removed.length > 0) writeQueue(userId, queue)
  return removed
}

/** Overlay queued changes on rows loaded from the server or session cache. */
export function applyPending(rows, queue) {
  if (!rows || rows.length === 0) return rows
  if (!queue || Object.keys(queue).length === 0) return rows

  let changed = false
  const next = rows.map(row => {
    const pending = queue[row.id]
    if (!pending) return row

    const sameStatus = row.status === pending.status
    const sameNumberVerify = !!row.error_number_verify === pending.error_number_verify
    const sameLocked = !!row.error_locked === pending.error_locked
    if (sameStatus && sameNumberVerify && sameLocked) return row

    changed = true
    return {
      ...row,
      status: pending.status,
      error_number_verify: pending.error_number_verify,
      error_locked: pending.error_locked,
      completed_at:
        pending.status === 'pending'
          ? null
          : (row.completed_at ?? new Date(pending.updatedAt).toISOString()),
    }
  })
  return changed ? next : rows
}
