import { connection } from 'next/server'
import { requireRole } from '@/lib/auth'
import AppShell from '@/components/app-shell'

// Supervisor pages use cookies and live Supabase data; opt out of instant
// prerendering instead of wrapping every page in Suspense.
export const instant = false

export default async function SupervisorLayout({ children }) {
  // Supabase auth reads the clock while validating tokens; force request-time
  // rendering so prerendering never touches Date.now().
  await connection()
  const { profile } = await requireRole(['supervisor', 'admin'])

  return (
    <AppShell
      panel="supervisor"
      title="Supervisor Panel"
      subtitle={profile.full_name || profile.email}
    >
      {children}
    </AppShell>
  )
}
