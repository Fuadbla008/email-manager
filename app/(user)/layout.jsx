import AppShell from '@/components/app-shell'

// User pages use cookies and live Supabase data; opt the whole segment out of
// instant prerendering instead of wrapping every page in Suspense.
export const instant = false

export default function UserLayout({ children }) {
  return (
    <AppShell panel="user" title="User Panel">
      {children}
    </AppShell>
  )
}
