'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useSyncExternalStore } from 'react'
import {
  BarChart3,
  CalendarDays,
  CheckSquare,
  FileSpreadsheet,
  History,
  LayoutDashboard,
  ListTodo,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Upload,
  UserPlus,
  Users,
  X,
} from 'lucide-react'
import LogoutButton from '@/components/logout-button'
import NetworkRefresh from '@/components/network-refresh'

const COLLAPSE_KEY = 'email-mgr:sidebar:collapsed'
const COLLAPSE_EVENT = 'email-mgr:sidebar-change'

// Nav lives here (not in the layouts) because the layouts are server
// components and component references cannot cross into a client component.
const NAV = {
  admin: [
    { href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/admin/upload', label: 'Upload CSV', icon: Upload },
    { href: '/admin/uploads', label: 'Upload Batches', icon: CalendarDays },
    { href: '/admin/assign', label: 'Assign', icon: UserPlus },
    { href: '/admin/verify', label: 'Verify', icon: CheckSquare },
    { href: '/admin/credentials', label: 'Credentials', icon: FileSpreadsheet },
    { href: '/admin/users', label: 'Users', icon: Users },
    { href: '/admin/activity', label: 'Activity Log', icon: History },
    { href: '/admin/reports', label: 'Reports', icon: BarChart3 },
  ],
  user: [
    { href: '/user', label: 'My Tasks', icon: ListTodo },
    { href: '/user/reports', label: 'My Reports', icon: BarChart3 },
  ],
  supervisor: [
    { href: '/supervisor', label: 'Overview', icon: LayoutDashboard },
    { href: '/supervisor/assign', label: 'Assign', icon: UserPlus },
    { href: '/supervisor/reports', label: 'Reports', icon: BarChart3 },
  ],
}

// The sidebar width is published as a CSS variable so page-level fixed bars can
// follow the toggle (e.g. the user tasks bulk action bar).
function subscribeSidebar(callback) {
  window.addEventListener('storage', callback)
  window.addEventListener(COLLAPSE_EVENT, callback)
  return () => {
    window.removeEventListener('storage', callback)
    window.removeEventListener(COLLAPSE_EVENT, callback)
  }
}

function getSidebarSnapshot() {
  try {
    return window.localStorage.getItem(COLLAPSE_KEY) === '1'
  } catch {
    return false
  }
}

function getSidebarServerSnapshot() {
  return false
}

function setSidebarCollapsed(next) {
  try {
    window.localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0')
  } catch {
    // Private mode / disabled storage: the toggle still works for this render.
  }
  // `storage` only fires in other tabs, so notify this tab explicitly.
  window.dispatchEvent(new Event(COLLAPSE_EVENT))
}

function NavLinks({ nav, home, pathname, collapsed, onNavigate, vertical = false }) {
  return (
    <nav
      className={
        vertical
          ? 'flex flex-col gap-1'
          : 'flex md:flex-col gap-1 overflow-x-auto pb-2 md:pb-0 md:flex-1'
      }
    >
      {nav.map(item => {
        const active =
          pathname === item.href ||
          (item.href !== home && pathname.startsWith(item.href + '/'))
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            title={collapsed ? item.label : undefined}
            aria-current={active ? 'page' : undefined}
            className={`flex items-center gap-2 rounded px-3 py-2 text-sm whitespace-nowrap transition-colors ${
              collapsed ? 'md:justify-center md:px-2' : ''
            } ${active ? 'bg-slate-700 text-white' : 'text-slate-200 hover:bg-slate-800'}`}
          >
            <item.icon size={16} className="shrink-0" />
            <span className={collapsed ? 'md:hidden' : ''}>{item.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}

/**
 * Shared chrome for the admin, user and supervisor areas.
 *
 * Desktop: a sidebar that collapses to an icon rail (persisted per browser).
 * Mobile: a compact top bar with a slide-over menu, so the content gets the
 * full width instead of being squeezed under a horizontal nav strip.
 */
export default function AppShell({ panel, title, subtitle, children }) {
  const pathname = usePathname()
  const collapsed = useSyncExternalStore(
    subscribeSidebar,
    getSidebarSnapshot,
    getSidebarServerSnapshot
  )
  const [mobileOpen, setMobileOpen] = useState(false)

  const nav = NAV[panel] ?? []
  const home = nav[0]?.href ?? '/'

  return (
    <div
      className="min-h-screen bg-slate-50 md:flex"
      style={{ '--sidebar-w': collapsed ? '4rem' : '16rem' }}
    >
      <NetworkRefresh />

      <header className="sticky top-0 z-30 flex items-center gap-3 bg-slate-900 px-3 py-2 text-white shadow md:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="rounded p-1.5 hover:bg-slate-800"
          aria-label="Open menu"
        >
          <Menu size={20} />
        </button>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold leading-tight">{title}</div>
          {subtitle && <div className="truncate text-[11px] text-slate-400">{subtitle}</div>}
        </div>
      </header>

      <aside
        className={`hidden shrink-0 flex-col overflow-y-auto bg-slate-900 p-4 text-white transition-[width] duration-200 md:sticky md:top-0 md:flex md:h-screen ${
          collapsed ? 'md:w-16' : 'md:w-64'
        }`}
      >
        <div className={`mb-4 flex items-center gap-2 ${collapsed ? 'md:justify-center' : 'justify-between'}`}>
          <div className={`min-w-0 ${collapsed ? 'md:hidden' : ''}`}>
            <h1 className="truncate text-lg font-bold leading-tight">{title}</h1>
            {subtitle && <p className="truncate text-xs text-slate-400">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={() => setSidebarCollapsed(!collapsed)}
            className="hidden shrink-0 rounded p-1.5 text-slate-300 hover:bg-slate-800 md:inline-flex"
            aria-label={collapsed ? 'Expand menu' : 'Collapse menu'}
            aria-expanded={!collapsed}
            title={collapsed ? 'Expand menu' : 'Collapse menu'}
          >
            {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
        </div>

        <NavLinks nav={nav} home={home} pathname={pathname} collapsed={collapsed} />

        <div className="mt-4">
          <LogoutButton compact={collapsed} />
        </div>
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-slate-900/60"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85%] flex-col overflow-y-auto bg-slate-900 p-4 text-white shadow-xl">
            <div className="mb-4 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h1 className="text-lg font-bold leading-tight">{title}</h1>
                {subtitle && <p className="truncate text-xs text-slate-400">{subtitle}</p>}
              </div>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="rounded p-1.5 hover:bg-slate-800"
                aria-label="Close menu"
              >
                <X size={20} />
              </button>
            </div>
            <NavLinks
              nav={nav}
              home={home}
              pathname={pathname}
              collapsed={false}
              vertical
              onNavigate={() => setMobileOpen(false)}
            />
            <div className="mt-4">
              <LogoutButton />
            </div>
          </aside>
        </div>
      )}

      <main className="min-w-0 flex-1 p-3 md:p-6">{children}</main>
    </div>
  )
}
