import Link from 'next/link'
import { logout } from '@/app/actions/auth'
import { Button } from '@/components/ui/button'
import {
  LayoutDashboard,
  Upload,
  CalendarDays,
  UserPlus,
  CheckSquare,
  FileSpreadsheet,
  Users,
  History,
  BarChart3,
} from 'lucide-react'

// Admin pages use cookies and live Supabase data; opt the whole segment out of
// instant prerendering instead of wrapping every page in Suspense.
export const instant = false

const nav = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/admin/upload', label: 'Upload CSV', icon: Upload },
  { href: '/admin/uploads', label: 'Upload Batches', icon: CalendarDays },
  { href: '/admin/assign', label: 'Assign', icon: UserPlus },
  { href: '/admin/verify', label: 'Verify', icon: CheckSquare },
  { href: '/admin/credentials', label: 'Credentials', icon: FileSpreadsheet },
  { href: '/admin/users', label: 'Users', icon: Users },
  { href: '/admin/activity', label: 'Activity Log', icon: History },
  { href: '/admin/reports', label: 'Reports', icon: BarChart3 },
]

export default function AdminLayout({ children }) {
  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      <aside className="w-full md:w-64 md:min-h-screen bg-slate-900 text-white p-4 flex flex-col">
        <h1 className="text-xl font-bold mb-4 md:mb-6">Admin Panel</h1>
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
          <Button variant="outline" type="submit" className="w-full">
            Logout
          </Button>
        </form>
      </aside>
      <main className="flex-1 min-w-0 p-3 md:p-6 bg-slate-50">{children}</main>
    </div>
  )
}
