'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { updateUserRole } from '@/app/actions/admin'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export default function RoleSelect({ profileId, role, canEdit }) {
  const router = useRouter()
  const [value, setValue] = useState(role)
  const [pending, startTransition] = useTransition()

  async function handleChange(nextRole) {
    if (nextRole === value) return
    const previous = value
    setValue(nextRole)
    const res = await updateUserRole(profileId, nextRole)
    if (res?.error) {
      setValue(previous)
      toast.error(res.error)
      return
    }
    toast.success(`Role changed to ${nextRole}`)
    startTransition(() => router.refresh())
  }

  if (!canEdit) {
    return <span className="text-xs text-slate-400">—</span>
  }

  return (
    <Select value={value} onValueChange={handleChange} disabled={pending}>
      <SelectTrigger className="w-32 h-8 text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="user">user</SelectItem>
        <SelectItem value="supervisor">supervisor</SelectItem>
        <SelectItem value="admin">admin</SelectItem>
      </SelectContent>
    </Select>
  )
}
