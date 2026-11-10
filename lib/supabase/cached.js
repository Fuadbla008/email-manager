import { unstable_cache } from 'next/cache'
import { createAdminClient } from './server'
import { fetchAllRows } from './fetch-all'

export const CREDENTIAL_CACHE_TAG = 'credential-data'

/**
 * Supervisor dashboard/report reads are identical for every visit until data
 * changes. Cache them for a short window and invalidate from the actions that
 * mutate credentials via CREDENTIAL_CACHE_TAG.
 */
export const getSupervisorAssignedRows = unstable_cache(
  async supervisorId => {
    const admin = createAdminClient()
    return fetchAllRows(() =>
      admin
        .from('email_credentials')
        .select(
          'id, assign_date, upload_date, assigned_to, status, verified_status, assigned_profile:profiles!assigned_to(full_name, email)'
        )
        .eq('assigned_by', supervisorId)
        .order('assign_date', { ascending: true })
        .order('id', { ascending: true })
    )
  },
  ['supervisor-assigned-rows'],
  { revalidate: 20, tags: [CREDENTIAL_CACHE_TAG] }
)
