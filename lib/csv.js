/**
 * CSV helpers shared by server actions and client components.
 * `columns` is an array of { key, label } objects.
 */

function escapeValue(value) {
  const text = value === null || value === undefined ? '' : String(value)
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`
  }
  return text
}

export function toCsv(columns, rows) {
  const header = columns.map(column => escapeValue(column.label)).join(',')
  const lines = rows.map(row =>
    columns.map(column => escapeValue(row[column.key])).join(',')
  )
  return [header, ...lines].join('\r\n')
}

export function safeFilename(name, fallback = 'export') {
  const cleaned = String(name || '')
    .trim()
    .replace(/[^a-z0-9._-]+/gi, '_')
    .replace(/^_+|_+$/g, '')
  return cleaned || fallback
}

export function downloadCsv(filename, csv) {
  if (typeof document === 'undefined') return
  // The BOM makes Excel open UTF-8 files correctly.
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
