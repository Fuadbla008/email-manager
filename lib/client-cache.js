/**
 * Tiny browser-side cache used by client pages.
 *
 * Data is kept in sessionStorage so it disappears when the tab closes. That
 * keeps plain-text credentials out of long-lived localStorage while still
 * making date/filter switches instant.
 */

const PREFIX = 'email-mgr:cache:v1:'
const DEFAULT_TTL = 5 * 60 * 1000

function getStore() {
  if (typeof window === 'undefined') return null
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

export function cacheKey(...parts) {
  return parts.filter(part => part !== undefined && part !== null).join(':')
}

export function cacheGet(key, { allowStale = false } = {}) {
  const store = getStore()
  if (!store) return null
  try {
    const raw = store.getItem(PREFIX + key)
    if (!raw) return null
    const entry = JSON.parse(raw)
    if (!entry || typeof entry.savedAt !== 'number') return null
    const ttl = entry.ttl ?? DEFAULT_TTL
    if (!allowStale && Date.now() - entry.savedAt > ttl) return null
    return entry.data
  } catch {
    return null
  }
}

export function cacheSet(key, data, ttl = DEFAULT_TTL) {
  const store = getStore()
  if (!store) return
  try {
    store.setItem(PREFIX + key, JSON.stringify({ savedAt: Date.now(), ttl, data }))
  } catch {
    // Storage can be full or disabled. The app must keep working.
  }
}

export function cacheUpdate(key, updater, ttl = DEFAULT_TTL) {
  const current = cacheGet(key, { allowStale: true })
  if (current === null) return
  const next = typeof updater === 'function' ? updater(current) : updater
  cacheSet(key, next, ttl)
}

export function cacheDelete(key) {
  const store = getStore()
  if (!store) return
  try {
    store.removeItem(PREFIX + key)
  } catch {
    // ignore
  }
}

export function cacheRemovePrefix(prefix) {
  const store = getStore()
  if (!store) return
  try {
    const full = PREFIX + prefix
    const keys = []
    for (let i = 0; i < store.length; i++) {
      const key = store.key(i)
      if (key && key.startsWith(full)) keys.push(key)
    }
    keys.forEach(key => store.removeItem(key))
  } catch {
    // ignore
  }
}
