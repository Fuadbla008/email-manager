-- Read-path indexes for dashboards, user task lists, date-wise reports, and CSV exports.
-- Safe to re-run. Run in the Supabase SQL editor before deploying the matching app code.

-- User task list + per-user report: filter by owner and date.
create index if not exists email_credentials_assigned_to_assign_date_idx
  on public.email_credentials (assigned_to, assign_date);

-- Admin dashboard / reports: filter and group by assignment date.
create index if not exists email_credentials_assign_date_idx
  on public.email_credentials (assign_date);

create index if not exists email_credentials_assign_date_assigned_to_idx
  on public.email_credentials (assign_date, assigned_to);

-- Unassigned pool for one upload batch, oldest first.
create index if not exists email_credentials_upload_pool_idx
  on public.email_credentials (upload_date, created_at)
  where assigned_to is null;

-- Supervisor pending list and unassign checks.
create index if not exists email_credentials_assigned_by_status_idx
  on public.email_credentials (assigned_by, status);

-- Default credentials list ordering and pagination.
create index if not exists email_credentials_created_at_idx
  on public.email_credentials (created_at desc);

-- Activity log pagination.
create index if not exists activity_logs_created_at_idx
  on public.activity_logs (created_at desc);

create index if not exists activity_logs_user_created_at_idx
  on public.activity_logs (user_id, created_at desc);

-- Make PostgREST pick up the new relation metadata immediately.
notify pgrst, 'reload schema';
