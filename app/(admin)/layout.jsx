import AppShell from '@/components/app-shell'

// Admin pages use cookies and live Supabase data; opt the whole segment out of
// instant prerendering instead of wrapping every page in Suspense.
export const instant = false

export default function AdminLayout({ children }) {
  return (
    <AppShell panel="admin" title="Admin Panel">
      {children}
    </AppShell>
  )
}
