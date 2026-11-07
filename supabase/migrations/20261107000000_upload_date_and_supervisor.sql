-- Upload batch date + supervisor ownership for email_credentials.
-- Run this in the Supabase SQL editor before deploying the matching app changes.

alter table public.email_credentials
  add column if not exists upload_date date,
  add column if not exists assigned_by uuid references public.profiles(id);

-- Backfill old assigned rows so they still appear in date-wise reports.
update public.email_credentials
set upload_date = assign_date
where upload_date is null and assign_date is not null;

-- Backfill unassigned/legacy rows from their creation date in Dhaka time so
-- they can still be assigned as a batch.
update public.email_credentials
set upload_date = (created_at at time zone 'Asia/Dhaka')::date
where upload_date is null;

create index if not exists email_credentials_upload_date_idx
  on public.email_credentials (upload_date);

create index if not exists email_credentials_assigned_by_date_idx
  on public.email_credentials (assigned_by, assign_date);

-- Allow the new supervisor role. Existing values are kept.
-- Drop any existing role check (constraint names differ between projects).
do $$
declare
  existing_constraint record;
begin
  for existing_constraint in
    select conname
    from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%role%'
  loop
    execute format('alter table public.profiles drop constraint %I', existing_constraint.conname);
  end loop;
end $$;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('admin', 'user', 'supervisor'));
