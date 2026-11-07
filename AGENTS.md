# AGENTS.md

Email/password batch management app: admins upload credentials by CSV against an upload date, assign batches to users per date, users mark status, admins verify against a result CSV, and reports compare claims vs. verification. Supervisors (a third role) can assign still-unassigned credentials from an upload batch and see reports for the users they assigned. Next.js 16 App Router + Supabase Auth/Postgres. `README.md` is create-next-app boilerplate; trust this file and the config instead.

## Commands

- `npm install` — npm only (`package-lock.json` is the lockfile).
- `npm run dev` — Turbopack dev server on `:3000`.
- `npm run build` / `npm start` — production build and serve.
- `npm run lint` — ESLint flat config across the whole repo.
- No test runner, typechecker, or formatter is configured. Do not invent `npm test` or a typecheck command.
- `npm run lint` currently exits 1 with 8 pre-existing `react-hooks/set-state-in-effect` errors (assign, credentials, reports, verify, tasks-view). Treat these as the baseline, not a regression; don't mass-rewrite effects unless the task is explicitly that.

## Stack constraints

- JavaScript only: `.jsx` for components, `.js` for actions/lib. No TypeScript.
- `@/*` maps to the repo root (`jsconfig.json`).
- Next 16: `cookies()`, `params`, and `searchParams` are async — always `await` them.
- `next.config.mjs` enables React Compiler, `cacheComponents`, `partialPrefetching`, and a Turbopack CSS loader. There is no `tailwind.config.*`.
- Because `cacheComponents` is on, pages reading `cookies()`/`searchParams` must be behind Suspense or opt out with `export const instant = false`. The root page and `(admin)`/`(user)`/`(supervisor)` layouts already do this; removing it makes `npm run build` fail.
- A page that only reads the clock (e.g. a default date) still gets statically prerendered; call `await connection()` from `next/server` before `new Date()` in that page. `app/(admin)/admin/upload/page.jsx` does this.
- Tailwind v4 theme lives in `app/globals.css` (`@import "tailwindcss"` + `shadcn/tailwind.css`). Use CSS variables, not a JS theme config.
- UI components are shadcn `base-nova` built on `@base-ui/react` primitives (not Radix). `cn` is re-exported from the `cn` package in `lib/utils.js`. Keep `tsx: false` in `components.json`.
- `date-fns` is not installed despite mentions in external notes; use native `Date`/`Intl` or add the dependency explicitly.
- `npm run build` passes but prints a non-fatal deprecation warning about `middleware.js` (Next 16 prefers `proxy.js`).

## Architecture

Route groups (parentheses are not URL segments):

- `app/(auth)/login/page.jsx` → `/login`
- `app/(user)/...` → `/user`, `/user/reports`
- `app/(admin)/...` → `/admin`, `/admin/upload`, `/admin/uploads`, `/admin/assign`, `/admin/verify`, `/admin/credentials`, `/admin/users`, `/admin/activity`, `/admin/reports`
- `app/(supervisor)/...` → `/supervisor`, `/supervisor/assign`, `/supervisor/reports`
- Verify must stay at `app/(admin)/admin/verify/page.jsx` → `/admin/verify`; nav and `revalidatePath('/admin/verify')` depend on that URL.
- `/admin/uploads` is the date-wise upload-batch summary (uploaded / assigned / remaining / done / error / verified per upload date).
- `/admin/users` shows per-profile workload with count-only queries and a role selector; `/admin/activity` is a server-rendered, paginated audit log backed by `activity_logs`.
- `/supervisor` is the supervisor overview, `/supervisor/assign` server-loads the unassigned pool for one upload date, and `/supervisor/reports` aggregates only rows where `assigned_by` is the current supervisor.

Supabase access split:

- `lib/supabase/server.js` — async `createClient()` (cookie-bound, RLS) and `createAdminClient()` (service role, bypasses RLS). Never import the admin client from a client component.
- `lib/supabase/client.js` — browser client for client-component reads.
- `lib/supabase/middleware.js` + root `middleware.js` — redirects unauthenticated users to `/login` and routes by `profiles.role` via `homeForRole()` in `lib/roles.js`.
- `lib/auth.js` — `requireRole(allowedRoles)` server-component guard; redirects to `/login` or the role's home.

Writes are server actions in `app/actions/*.js` (`'use server'`). Admin actions call `requireAdmin()` (auth + role check) before using the service-role client. Supervisor actions live in `app/actions/supervisor.js` and call `requireSupervisor()` (allows `supervisor` and `admin`). `updateStatus` first checks credential ownership with the user-scoped client, then updates with the service-role client and appends `activity_logs`. Keep this ordering when adding mutations.

Supervisor pages read with the service-role client after a role guard because existing RLS only exposes credentials where `assigned_to = auth.uid()`; the unassigned pool is not visible to a supervisor through RLS.

Reads: server pages query Supabase directly; client CRUD/report pages use the browser client and call `revalidatePath` via actions after mutations. Schema changes live in `supabase/migrations/`; run new migrations in the hosted Supabase project before deploying matching code.

## Data model

- `profiles`: `id`, `full_name`, `email`, `role` (`admin` | `user` | `supervisor`).
- `email_credentials`: `email`, `password`, `status` (`pending|done|error`), `upload_date` (`YYYY-MM-DD`, set at upload), `assigned_to`, `assign_date` (`YYYY-MM-DD`), `assigned_at`, `assigned_by` (who assigned it), `verified_status` (`done|error|null`), `verified_at`, `verified_by`, `completed_at`, `created_at`.
- `activity_logs`: `user_id`, `credential_id`, `old_status`, `new_status`.
- Joined profile data uses `profiles!assigned_to(...)`; `assigned_by` is not the same relationship.
- Migration `supabase/migrations/20261107000000_upload_date_and_supervisor.sql` adds `upload_date`, `assigned_by`, indexes, backfills legacy rows, and widens the `profiles.role` check to include `supervisor`.

## Domain quirks

- **Dhaka time (UTC+6):** "today" is computed as `new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString().slice(0, 10)` in dashboard/assign/verify/reports. Reuse that pattern; don't switch to browser-local dates.
- CSV parsing uses PapaParse and matches header names *containing* `email`/`password`/`result`, case-insensitively. Verify accepts only `done` or `error` (case-insensitive); other rows are skipped.
- Batch sizes are intentional: upload insert 500 rows/chunk, assign 100 IDs/chunk, unassign max 50 per call (enforced in both UI and action). Keep client and server limits in sync.
- Upload requires an explicit `upload_date`. The value persists through assignment/unassignment and is the grouping key for `/admin/uploads`; `assign_date` is the date the work is due, not the upload date.
- Assign supports two flows: manual selection (`assignCredentials`) and quantity-based auto-assign (`assignNextCredentials`, max 500 per click, oldest unassigned first), both optionally scoped to an upload date. The page also accepts `?user=<profile-id>`, `?date=YYYY-MM-DD`, and `?upload=YYYY-MM-DD` presets.
- Supervisor assignment has its own actions (`supervisorAssignSelected`, `supervisorAssignNext`). They only touch rows where `upload_date` matches and `assigned_to IS NULL`, validate the target profile is `role = 'user'`, and stamp `assigned_by = supervisor.id`.
- Supervisor reports and the overview filter by `assigned_by = current user id`; admins can open the same pages and see their own assignments. `unassignCredentials` clears `assigned_by`.
- Large list queries are explicitly capped: assign pool `.limit(500)`, dashboard date list `.limit(500)`, supervisor batch-date list `.limit(5000)`, credentials paginated at 50/page. Reports that must cover every row use `lib/supabase/fetch-all.js` in 1000-row pages.
- Emails are trimmed and lowercased on upload and verify. Preserve normalization on new import/verification paths.
- Layouts are mobile-first now (`flex-col md:flex-row`, horizontally scrolling nav, `min-w-0` main, `overflow-auto` tables). The user bulk bar uses `left-0 md:left-64` to match the sidebar.

## Environment

Required vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (in `.env.local`, gitignored). Never commit, log, or echo the service-role key.

Before deploying code that touches upload dates or supervisors, run `supabase/migrations/20261107000000_upload_date_and_supervisor.sql` in the Supabase SQL editor. Without `upload_date`, `assigned_by`, and the widened role check, upload/assign/supervisor queries fail.

Supervisor accounts are still created manually in Supabase Auth + `profiles` (same as users). An admin can also promote an existing profile to `supervisor` from `/admin/users`.
