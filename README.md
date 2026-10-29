# KKF Academy · Exam Technique Lab

An eight-activity Year 10–11 Science and Maths trainer with command/topic identification, immediate guidance, email sign-in and teacher reporting.

**For the Super Admin upgrade on the existing Vercel site, start with [ADMIN_UPGRADE.md](ADMIN_UPGRADE.md) or ADMIN_UPGRADE.txt.** Keep the existing Supabase database and accounts. The upgrade adds app-based account creation/invitations and assignment-based teacher permissions.

[CLOUDFLARE_SETUP.md](CLOUDFLARE_SETUP.md) remains an optional, deferred hosting reference; moving to Cloudflare is not part of this upgrade.

[SETUP.md](SETUP.md) retains the original Vercel + Supabase setup reference.

## Included

- `dist/`: responsive frontend, teacher dashboard, public configuration and bundled official Supabase SDK.
- `supabase/01-schema.sql`: membership, database tables, RLS and authenticated backend/scoring functions.
- `supabase/02-questions.sql`: immutable `kkf-v1` question catalogue.
- `supabase/03-teacher.sql`: project-owner teacher bootstrap (edit your email first).
- `supabase/04-verification.sql`: read-only setup checks.
- `supabase/05-super-admin.sql`: non-destructive upgrade, canonical account directory, Super Admin permission, multiple teacher assignments, scoped reports/RLS and retained teacher review history.
- `supabase/06-bootstrap-super-admin.sql`: designate the existing teacher account once.
- `supabase/07-admin-verification.sql`: read-only upgrade checks.
- `supabase/functions/kkf-admin/`: server-only account management and invitation orchestration.
- `supabase/kkf-admin-dashboard.ts`: generated single-file function for the Supabase dashboard editor.
- `dist/admin.html` and `admin.js`: Super Admin account management.
- `scripts/build.mjs`: builds public config from Vercel environment variables and bundles the SDK.
- `tests/`: scoring, real Postgres permissions/functions, DOM interaction, reporting and CSV tests.
- `vercel.json`: build, output and HTTP security headers.
- `cloudflare/worker.js` and `wrangler.jsonc`: Cloudflare hosting with signed Access-token verification before every resource request; missing setup refuses access.
- `scripts/build-cloudflare.mjs`: requires both real public Supabase build values.
- `CLOUDFLARE_SETUP.md`: private hosting, exact-email Access policies, account migration and live verification steps.

## Commands

```bash
npm ci
npm run build
npm test
python -m http.server 8000 --directory dist
```

Set `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` to connect the build. They are public configuration. Never use secret/service-role keys in browser code. Without both values the trainer clearly labels its browser-only demo and does not collect student emails or send teacher records.

## Assessment

Each activity has 1 command point, 1 topic point and up to 2 answer points. The server marks identification and calculation results/units from its own catalogue. Written answers use explicit student self-review until a teacher reviews them. Teacher review replaces only the two written-answer points. This is practice scoring, not an exam grade.

Submitted choices and answers are immutable for students. Refresh resumes the latest saved session. Unsubmitted drafts stay in the tab. A fresh session preserves previous database records. Teachers can search sessions, inspect each question and original response, record written-answer feedback, manage roster access, inspect last sign-in and export matching CSV records.

Hosting access and app permissions are separate. The user has chosen to disable Vercel hosting protection while finishing setup. This upgrade enforces database/account permissions, while the separate task of protecting downloadable question files remains deferred. The original Sites demo remains owner-private with blank backend configuration. Live collection and the new controls require the user's configured Supabase project, upgrade SQL and deployed account-management function.
