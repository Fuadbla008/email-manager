'use client'

import { useState, useEffect } from 'react'
import Papa from 'papaparse'
import { toast } from 'sonner'
import { verifyCredentials } from '@/app/actions/admin'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'

function todayDhaka() {
  const now = new Date()
  const dhaka = new Date(now.getTime() + 6 * 60 * 60 * 1000)
  return dhaka.toISOString().slice(0, 10)
}

export default function VerifyPage() {
  const [date, setDate] = useState('')
  const [rows, setRows] = useState([])
  const [fileName, setFileName] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)

  useEffect(() => { setDate(todayDhaka()) }, [])

  function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setResult(null)
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const keys = res.data[0] ? Object.keys(res.data[0]) : []
        const emailKey = keys.find(k => k.toLowerCase().includes('email'))
        const resultKey = keys.find(k => k.toLowerCase().includes('result'))
        const parsed = res.data.map(r => {
          const raw = String((resultKey ? r[resultKey] : '') || '').trim()
          const low = raw.toLowerCase()
          return {
            Email: emailKey ? String(r[emailKey] || '').trim() : '',
            Result: low,
            rawResult: raw,
            valid: low === 'done' || low === 'error',
          }
        }).filter(r => r.Email)
        setRows(parsed)
      },
    })
  }

  const validRows = rows.filter(r => r.valid)
  const invalidRows = rows.filter(r => !r.valid)

  async function handleVerify() {
    if (!date) return toast.error('Select a date')
    if (validRows.length === 0) return toast.error('No valid rows')
    setLoading(true)
    const res = await verifyCredentials({
      date,
      rows: validRows.map(r => ({ Email: r.Email, Result: r.Result })),
    })
    setLoading(false)
    if (res?.error) toast.error(res.error)
    else {
      toast.success(`Verified ${res.updated} of ${res.total}`)
      setResult(res)
      setRows([])
      setFileName('')
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">Verify Credentials</h1>
      <p className="text-sm text-slate-500 mb-6">
        Upload <code>Email,Result</code> CSV. Result must be <code>done</code> or <code>error</code> (case-insensitive).
        Sets <b>verified_status</b> without touching the users claim.
      </p>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>1. Select Date &amp; CSV</CardTitle>
          <CardDescription>Only credentials of the selected date are matched.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Date</Label>
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-48" />
          </div>
          <div>
            <Label>CSV File</Label>
            <Input type="file" accept=".csv" onChange={handleFile} />
          </div>
        </CardContent>
      </Card>

      {rows.length > 0 && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>
              Preview — {validRows.length} valid, {invalidRows.length} invalid ({fileName})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {invalidRows.length > 0 && (
              <div className="mb-3 p-3 bg-orange-50 border border-orange-200 rounded text-sm">
                <b>{invalidRows.length} row(s) will be skipped.</b> Result must be exactly <code>done</code> or <code>error</code>.
              </div>
            )}
            <div className="max-h-80 overflow-auto border rounded mb-3">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Result</TableHead>
                    <TableHead>Valid</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.slice(0, 100).map((r, i) => (
                    <TableRow key={i} className={r.valid ? '' : 'bg-red-50'}>
                      <TableCell className="font-mono text-sm">{r.Email}</TableCell>
                      <TableCell>
                        {r.valid ? (
                          <Badge className={r.Result === 'done' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}>
                            {r.Result}
                          </Badge>
                        ) : (
                          <span className="text-red-600 text-xs">&quot;{r.rawResult}&quot;</span>
                        )}
                      </TableCell>
                      <TableCell>{r.valid ? '✓' : '✗'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <Button onClick={handleVerify} disabled={loading || validRows.length === 0}>
              {loading ? 'Verifying…' : `Verify ${validRows.length} rows on ${date || '…'}`}
            </Button>
          </CardContent>
        </Card>
      )}

      {result && (
        <Card>
          <CardHeader><CardTitle>Verification Result</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <div className="text-slate-500">Total</div>
                <div className="text-2xl font-bold">{result.total}</div>
              </div>
              <div>
                <div className="text-slate-500">Updated</div>
                <div className="text-2xl font-bold text-green-600">{result.updated}</div>
              </div>
              <div>
                <div className="text-slate-500">Not Found</div>
                <div className="text-2xl font-bold text-red-600">{result.notFound?.length || 0}</div>
              </div>
            </div>
            {result.notFound?.length > 0 && (
              <div className="mt-4 p-3 bg-orange-50 border border-orange-200 rounded text-sm">
                <b>Not found on {date}:</b>
                <ul className="mt-1 list-disc pl-5">
                  {result.notFound.slice(0, 20).map((e, i) => (
                    <li key={i} className="font-mono text-xs">{e}</li>
                  ))}
                  {result.notFound.length > 20 && (
                    <li>… and {result.notFound.length - 20} more</li>
                  )}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}