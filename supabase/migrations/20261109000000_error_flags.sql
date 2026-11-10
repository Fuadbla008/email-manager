-- Error detail flags for the user task table.
--
-- Only meaningful when `status = 'error'`. The user sets them from the tasks
-- page; they are intentionally not rendered on admin/supervisor dashboards and
-- only surface in the admin detail CSV export.

alter table public.email_credentials
  add column if not exists error_number_verify boolean not null default false,
  add column if not exists error_locked boolean not null default false;

comment on column public.email_credentials.error_number_verify is
  'User-reported: the email account needs number verification (only when status = error).';
comment on column public.email_credentials.error_locked is
  'User-reported: the email account is locked (only when status = error).';

-- Keep the flags meaningful: a row that is not an error never carries error flags.
update public.email_credentials
set error_number_verify = false,
    error_locked = false
where status <> 'error'
  and (error_number_verify or error_locked);

-- Make PostgREST see the new columns immediately.
notify pgrst, 'reload schema';
