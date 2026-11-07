import Link from 'next/link'
import { requireRole } from '@/lib/auth'
import { logout } from '@/app/actions/auth'
import { Button } from '@/components/ui/button'
import { LayoutDashboard, UserPlus, BarChart3 } from 'lucide-react'

// Supervisor pages use cookies and live Supabase data; opt out of instant
// prerendering instead of wrapping every page in Suspense.
export const instant = false

const nav = [
  { href: '/supervisor', label: 'Overview', icon: LayoutDashboard },
  { href: '/supervisor/assign', label: 'Assign', icon: UserPlus },
  { href: '/supervisor/reports', label: 'Reports', icon: BarChart3 },
]

export default async function SupervisorLayout({ children }) {
  const { profile } = await requireRole(['supervisor', 'admin'])

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      <aside className="w-full md:w-64 md:min-h-screen bg-slate-900 text-white p-4 flex flex-col">
        <h1 className="text-xl font-bold mb-1">Supervisor Panel</h1>
        <p className="text-xs text-slate-400 mb-4 md:mb-6 truncate">
          {profile.full_name || profile.email}
        </p>
        <nav className="flex md:flex-col gap-1 overflow-x-auto pb-2 md:pb-0 md:flex-1">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-2 px-3 py-2 rounded hover:bg-slate-800 text-sm whitespace-nowrap"
            >
              <item.icon size={16} />
              {item.label}
            </Link>
          ))}
        </nav>
        <form action={logout} className="mt-3 md:mt-4">
          <Button
            variant="outline"
            type="submit"
            className="w-full border-white/20 bg-white text-slate-900 hover:bg-slate-100 hover:text-slate-900"
          >
            Logout
          </Button>
        </form>
      </aside>
      <main className="flex-1 min-w-0 p-3 md:p-6 bg-slate-50">{children}</main>
    </div>
  )
}
