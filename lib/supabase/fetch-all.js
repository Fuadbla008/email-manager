/**
 * Fetch every row from a Supabase query, 1000 rows at a time.
 * Pass a function that returns a fresh query each call, and always include a
 * unique `.order('id')` tiebreaker so pages cannot overlap or skip rows.
 *
 *   const rows = await fetchAllRows(() =>
 *     supabase.from('email_credentials').select('id').order('created_at').order('id')
 *   )
 *
 * The loop stops on an empty page instead of a short page: PostgREST caps the
 * response at the project's "max rows" setting, which may be lower than
 * `pageSize`. A short page can therefore mean "server cap", not "end of data".
 */
export async function fetchAllRows(buildQuery, { pageSize = 1000 } = {}) {
  const rows = []
  let from = 0

  for (;;) {
    const { data, error } = await buildQuery().range(from, from + pageSize - 1)
    if (error) throw new Error(error.message)

    const chunk = data ?? []
    if (chunk.length === 0) break

    rows.push(...chunk)
    from += chunk.length
  }

  return rows
}
