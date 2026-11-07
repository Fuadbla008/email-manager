import { connection } from 'next/server'
import UploadView from './upload-view'

function todayDhaka() {
  const now = new Date()
  const dhaka = new Date(now.getTime() + 6 * 60 * 60 * 1000)
  return dhaka.toISOString().slice(0, 10)
}

export default async function UploadPage() {
  // The default upload date must be computed at request time, not at build time.
  await connection()
  return <UploadView defaultDate={todayDhaka()} />
}
