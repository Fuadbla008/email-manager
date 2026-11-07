/**
 * Fetch every row from a Supabase query, 1000 rows at a time.
 * Pass a function that returns a fresh query each call.
 *
 *   const rows = await fetchAllRows(() =>
 *     supabase.from('email_credentials').select('id').order('created_at')
 *   )
 */
export async function fetchAllRows(buildQuery, { pageSize = 1000 } = {}) {
  const rows = []
  let from = 0

  for (;;) {
    const { data, error } = await buildQuery().range(from, from + pageSize - 1)
    if (error) throw new Error(error.message)

    const chunk = data ?? []
    rows.push(...chunk)
    if (chunk.length < pageSize) break
    from += pageSize
  }

  return rows
}
