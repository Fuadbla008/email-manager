'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { exportSupervisorCredentials } from '@/app/actions/export'
import { downloadCsv } from '@/lib/csv'
import { Button } from '@/components/ui/button'

export default function ExportSupervisorButton({ userId = 'all', from = '', to = '' }) {
  const [busy, setBusy] = useState(false)

  async function handleExport() {
    if (busy) return
    setBusy(true)
    const res = await exportSupervisorCredentials({ userId, from, to })
    setBusy(false)
    if (res?.error) {
      toast.error(res.error)
      return
    }
    downloadCsv(res.filename, res.csv)
    toast.success(`Downloaded ${res.count} row(s)`)
  }

  return (
    <Button variant="outline" size="sm" onClick={handleExport} disabled={busy}>
      {busy ? 'Preparing…' : 'Export CSV'}
    </Button>
  )
}
