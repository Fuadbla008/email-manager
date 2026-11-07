'use client'

import { useState } from 'react'
import Papa from 'papaparse'
import { uploadCredentials } from '@/app/actions/admin'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { toast } from 'sonner'

export default function UploadView({ defaultDate }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [fileName, setFileName] = useState('')
  const [uploadDate, setUploadDate] = useState(defaultDate)

  function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const cleaned = results.data.map(r => {
          const keys = Object.keys(r)
          const emailKey = keys.find(k => k.toLowerCase().includes('email'))
          const passKey = keys.find(k => k.toLowerCase().includes('password'))
          return {
            Email: emailKey ? r[emailKey] : '',
            Password: passKey ? r[passKey] : '',
          }
        }).filter(r => r.Email && r.Password)
        setRows(cleaned)
      },
    })
  }

  async function handleSubmit() {
    if (rows.length === 0) return
    if (!uploadDate) {
      toast.error('Choose the upload date first.')
      return
    }
    setLoading(true)
    const fd = new FormData()
    fd.append('rows', JSON.stringify(rows))
    fd.append('uploadDate', uploadDate)
    const res = await uploadCredentials(fd)
    setLoading(false)
    if (res?.error) {
      toast.error(res.error)
    } else {
      toast.success(`Inserted ${res.inserted} / ${res.total} for ${res.uploadDate}. Failed: ${res.failed}`)
      setRows([])
      setFileName('')
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">Upload Credentials (CSV)</h1>
      <p className="text-sm text-slate-500 mb-6">
        Every batch is stored against the upload date so you can track how many were
        assigned, how many are left, and how many were completed.
      </p>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>1. Choose Upload Date</CardTitle>
          <CardDescription>
            This is the batch date. Assignments and date-wise reports use it.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-1 max-w-xs">
            <Label htmlFor="upload-date">Upload date</Label>
            <Input
              id="upload-date"
              type="date"
              value={uploadDate}
              onChange={e => setUploadDate(e.target.value)}
              className="w-full"
            />
          </div>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>2. Select CSV File</CardTitle>
          <CardDescription>File must contain Email and Password columns.</CardDescription>
        </CardHeader>
        <CardContent>
          <Input type="file" accept=".csv" onChange={handleFile} />
        </CardContent>
      </Card>

      {rows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>3. Preview ({rows.length} rows from {fileName})</CardTitle>
            <CardDescription>Upload date: {uploadDate || 'not selected'}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="max-h-80 overflow-auto border rounded mb-4">
              <Table>
                <TableHeader>
                  <TableRow><TableHead>Email</TableHead><TableHead>Password</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {rows.slice(0, 10).map((r, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-mono text-sm">{r.Email}</TableCell>
                      <TableCell className="font-mono text-sm">{r.Password}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <Button onClick={handleSubmit} disabled={loading || !uploadDate}>
              {loading ? 'Uploading…' : `Upload ${rows.length} Rows`}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
