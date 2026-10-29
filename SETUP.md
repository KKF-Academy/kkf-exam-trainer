# KKF Academy: frontend, backend and database setup

**The existing Vercel site now has a Super Admin upgrade package.** Follow [ADMIN_UPGRADE.md](ADMIN_UPGRADE.md) or ADMIN_UPGRADE.txt for app-based teacher/student registration and teacher assignments. Preserve the existing Supabase project; do not repeat the original installation SQL. The steps below describe the original pilot setup.

**Moving the existing trainer to private Cloudflare hosting?** Follow [CLOUDFLARE_SETUP.md](CLOUDFLARE_SETUP.md). Keep your current Supabase project, schemas, questions, accounts and results; do not rerun installation SQL. The Vercel instructions below remain a reference for the old host.

This guide connects the supplied trainer to YOUR Supabase project and deploys the frontend on YOUR Vercel account. Until the two public configuration values are supplied, the website runs in clearly labelled demo mode and sends no student records to a teacher.

## What runs where

| Layer | Location | Job |
|---|---|---|
| Frontend | Vercel, from `dist/` | Student practice and `teacher.html` |
| Authentication | Supabase Auth | Verified email sign-in with a one-time code |
| Backend | Supabase database functions | Membership checks, immutable submissions, scoring and teacher review |
| Database | Supabase Postgres | Registered emails, sessions, answers and feedback |

There is no additional Express server to host. `dist/backend.js` connects the frontend to Supabase Auth and calls the backend functions using the signed-in student's identity. The SQL functions execute on the database server. Teachers read class reports through a teacher-only backend function.

## 1. Put the complete project in GitHub

1. Download and extract `KKF_Exam_Trainer_Full_Source.zip`.
2. Use a private repository owned by your GitHub organisation, for example `kkf-exam-trainer`.
3. Upload the extracted CONTENTS, preserving the folders. The repository root must contain `package.json`, `package-lock.json`, `vercel.json`, `scripts/`, `supabase/` and `dist/`.
4. Commit the files to `main`.

These instructions replace the earlier five-file, no-build deployment instructions. The new version bundles the official Supabase client and builds its public configuration.

A private GitHub organisation repository requires a Vercel Pro or Enterprise team for the native Git connection. A paid GitHub organisation plan is separate from your Vercel plan. Check the current [Vercel Git requirements](https://vercel.com/docs/git#deploying-private-git-repositories).

## 2. Create a Supabase project

1. Sign in at https://supabase.com/dashboard and create a new project in your organisation.
2. Choose a region appropriate for your learners and set a strong database password. Save the password securely; it is NOT used in frontend code.
3. Wait for the database to finish provisioning.
4. Use a NEW project or confirm it has no existing `kkf_*` objects. The schema script is an initial installation, not a destructive replacement or a migration for an existing installation.

## 3. Install the backend and database tables

Open the Supabase project's **SQL Editor**.

1. Create a new query, copy all of `supabase/01-schema.sql`, and run it once. It creates the tables, permissions and backend functions.
2. Create another query, copy all of `supabase/02-questions.sql`, and run it. It installs the eight questions and their server-side answer keys.
3. To check that the questions were installed, stay in **Supabase → SQL Editor** and click **New query**.
4. Paste the following SQL into the query area, then click **Run**:

```sql
select count(*)
from kkf_private.questions
where quiz_version = 'kkf-v1';
```

5. Look at the **Results** panel below the editor. You should see a column named `count` with the value **8**. This confirms that all eight questions were installed.

If the result is **0**, run `supabase/02-questions.sql` in this same project, then repeat the check. If the error says that `kkf_private.questions` does not exist, check that you selected the correct project and successfully ran `01-schema.sql` before the question seed. Resolve script errors before continuing. Do not disable row-level security to get around an error.

The public tables are `kkf_sessions` and `kkf_attempts`. Students have read access only to their own records. Writes go through authenticated backend functions. The private schema holds the question catalogue, roster and teacher membership.

## 4. Get the frontend connection values

In Supabase, use the project's **Connect** dialog or **Settings → API Keys / Data API** to find:

- **Project URL**, such as `https://YOUR_PROJECT_REF.supabase.co`.
- **Publishable key**, beginning `sb_publishable_`.

These are public frontend connection values. The publishable key works with each signed-in user's identity and the installed database permissions. This app deliberately rejects secret keys and legacy service-role keys in its frontend configuration.

Never put your database password, `sb_secret_` key or service-role key in `dist/`, GitHub, a screenshot, or this chat. No privileged API key is required for this implementation.

## 5. Protect the Vercel project before the first deployment

Keep the privacy requirement from the original brief:

1. In the Vercel team you will deploy under, open **Deployment Protection** settings.
2. Set **Vercel Authentication → All Deployments** as the default for new projects.
3. Preserve that setting when importing the repository.

This is a hosting access gate. Student email sign-in inside the trainer is an additional, separate account system. Students who use the private Vercel site must also have permission to pass its hosting gate. Follow Vercel's current authorised-viewer options when granting that access. Do not select public/unprotected hosting unless you intentionally approve that audience change.

The teacher dashboard also enforces its own database teacher role even after a visitor passes the hosting gate.

## 6. Connect GitHub to Vercel and set the two variables

1. Open https://vercel.com/new and select the Vercel team from step 5.
2. Connect your personal GitHub login that owns or belongs to your organisation.
3. Authorise the Vercel GitHub app for this repository and import `kkf-exam-trainer`.
4. Use these settings (the included `vercel.json` supplies the build and output settings):

| Setting | Value |
|---|---|
| Framework preset | Other |
| Root directory | Repository root; leave blank in the dashboard |
| Install command | Default (`npm install`) |
| Build command | `npm run build` |
| Output directory | `dist` |

5. In Vercel's **Environment Variables** section, create the following TWO entries for **Production**. The form may label its boxes **Key** and **Value**. Type each variable name yourself into **Key**; these names do not need to appear in a dropdown.

| Key — type this exactly | Value — paste your own |
|---|---|
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_PUBLISHABLE_KEY` | Your `sb_publishable_...` key |

   - Enter `SUPABASE_URL` in the first **Key** box and paste your project's URL in its **Value** box.
   - Add another entry. Enter `SUPABASE_PUBLISHABLE_KEY` as its **Key** and paste your publishable key as its **Value**.
   - Select **Production** and save both entries. The values come from step 4 above; use your actual project values.
   - Add the same entries to **Preview** only if you intend preview deployments to use this same pilot database.

6. Deploy. The build generates `dist/config.js` and bundles the official Supabase SDK into `dist/vendor/supabase.js`.
7. Copy your actual Vercel URL.

After changing these variables, **redeploy**. This is a static frontend: variables are compiled into the public configuration at build time and do not change an already-deployed page.

If you are updating an existing five-file Vercel project, change its old build/output overrides to the values above before redeploying.

## 7. Configure sign-in, email delivery and redirect URLs in Supabase

These settings are on separate pages within **Authentication**. Use this map to find each one:

| What you are setting up | Where to go |
|---|---|
| Website address and redirect addresses | **Authentication → URL Configuration** |
| Email sign-in provider | **Authentication → Sign In / Providers → Email** |
| Whether visitors can create their own accounts | Main **Authentication → Sign In / Providers** page |
| Email delivery service | **Authentication → Email / SMTP settings** |
| Sign-in code and invitation email content | **Authentication → Email Templates** |

### 7A. Enter your website address

This tells Supabase where to send someone after they click an invitation link.

1. Open **Authentication → URL Configuration**.
2. Paste your main Vercel website address into **Site URL**, including a trailing slash.
3. Under **Redirect URLs**, click **Add URL** and paste that same address.
4. Save the changes.

For example, IF Vercel gave you `https://your-project.vercel.app`, enter:

| Field | Example value |
|---|---|
| Site URL | `https://your-project.vercel.app/` |
| Redirect URLs | `https://your-project.vercel.app/` |

Replace the example with your actual Vercel address. “Root URL” means the main website address above, without a page name such as `teacher.html`.

For the current application, you only need that main address in both places. The teacher dashboard opens after sign-in, so adding its `teacher.html` address separately is optional. If you later use a different preview deployment or a local test server, add that particular address when you need it.

### 7B. Enable email sign-in and turn public sign-up off

1. In the **Authentication** sidebar, click **Sign In / Providers**.
2. Open **Email**.
3. Make sure **Enable Email provider** is **ON**, then save.
4. Return to the main **Sign In / Providers** page.
5. Find **Allow new users to sign up**, switch it **OFF**, and save.

| Setting | Choose | What it does |
|---|---|---|
| Email provider | ON | Lets existing users receive email sign-in codes. |
| Allow new users to sign up | OFF | Stops visitors creating their own accounts. |

The provider and sign-up options are on **Sign In / Providers**; **URL Configuration** contains the website and redirect address fields.

The website already contains `shouldCreateUser: false`. You do not need to edit this code. It tells the login form to sign in an existing account. You register students in the teacher dashboard and invite their emails through **Authentication → Users** (step 9 below).

### 7C. Configure how Supabase sends emails

1. Open **Authentication → Email / SMTP settings**.
2. Enter your email service's SMTP host, port, username, password and verified sender address.
3. Save these credentials in Supabase's settings.

The built-in demonstration sender is restricted and is not suitable for sending codes to your class. Use your email service's SMTP credentials here, rather than the Vercel environment-variable values from step 6.

### 7D. Configure the sign-in code and invitation email templates

1. Open **Authentication → Email Templates → Magic Link**.
2. Use the one-time token in the email body:

```html
<h2>Your KKF Academy sign-in code</h2>
<p>Enter this code in the trainer:</p>
<p><strong>{{ .Token }}</strong></p>
<p>If you did not request this code, ignore this email.</p>
```

3. Save the Magic Link template.
4. Open the **Invite User** template and keep its working `{{ .ConfirmationURL }}` link. An invitation can establish the initial verified session; subsequent sign-ins use the code form.

The frontend handles Supabase invitation links returned to the configured site. The app accepts the email code length supported by its form (6–10 digits). If you customise Supabase's OTP length, keep it within that range.

## 8. Create your teacher account and grant teacher access

1. Open **Supabase → Authentication → Users → Add user → Invite user**.
2. Invite the email you want to use as the KKF Academy teacher. This sends an invitation email and creates the Auth user.
3. Open `supabase/03-teacher.sql`. Replace `REPLACE_WITH_YOUR_TEACHER_EMAIL` with that same email.
4. Run the edited script in the Supabase SQL Editor. It adds the existing Auth user's ID to the private teacher table.
5. Open the invitation link. If you have already accepted it, sign in using a new code from the trainer.
6. Open your Vercel site's `/teacher.html`, or use the **Teacher dashboard** link shown after teacher sign-in.

If the SQL script says “No Auth account found”, check the email spelling and complete the invitation step first. The private teacher table is managed by the Supabase project owner; students cannot add themselves to it.

For another authorised teacher, repeat these steps with their email. This pilot gives each authorised teacher access to the academy roster and all pilot sessions; class-by-class teacher scoping is outside this version.

## 9. Register and invite each student

1. In the teacher dashboard, open **Registered students & access**.
2. Enter the student's email and an optional display name, then select **Register student**. This adds the email to the private application roster.
3. In Supabase **Authentication → Users**, invite that same email if no Auth account exists yet. The roster displays whether an account was found.
4. Give the student authorised access to the private Vercel deployment through its hosting access controls.
5. The student opens the trainer, accepts the invitation or requests a code, and signs in.
6. As they check choices, submit an answer and finish each review, those stages are saved to the database. Draft text that has not been submitted stays in their current tab.

Roster membership and an Auth account are both required. A new email in the roster does not automatically send an invitation. Disabling the roster entry removes access to records and further submissions while retaining existing results.

On a shared device, students should sign out. Authentication and drafts use tab-session storage; avoid sharing the same active tab between accounts.

## 10. Confirm the connection end to end

Use one teacher account and two separate test student emails.

1. Student A signs in and completes activity 1. Check the choices deliberately incorrectly if you want to verify error reporting.
2. Refresh the student page. It should resume the saved session without allowing the first submitted selections to change.
3. Sign in as the teacher. Refresh the report, search Student A's email, and open that session.
4. Confirm the email, first selections, original answer, timestamps, score and marking source are visible.
5. Save a teacher review for a written answer. The dashboard's score should change. The student sees the teacher-reviewed score and feedback after refreshing their saved session.
6. Complete a calculation with a wrong unit. Confirm number and unit points are checked independently.
7. Sign in as Student B. They must not see Student A's records, and the teacher dashboard must refuse a student account.
8. Export the matching CSV and check its contents. The export includes unattempted questions, so incomplete work remains visible.
9. Run `supabase/04-verification.sql` in the SQL Editor. It should show 8 catalogue questions, your teacher email, row security enabled, and `false` for direct student INSERT/UPDATE privileges.
10. Open the Vercel URL in a signed-out private browser window and verify its hosting access gate is still enabled.

## Daily use

- Teacher URL: your actual deployed origin followed by `/teacher.html`.
- Search results by email or display name. Reports show 25 sessions per page.
- The roster includes registered emails even before they submit a practice session; it shows account presence and last sign-in where available.
- “Full credit”, “Partial credit” and “No credit” reflect awarded practice points. Each question also shows whether the selected command and topic were correct.
- Written-answer self-review stays explicitly labelled. Teacher review replaces its two answer-practice points; it does not change the two automatic identification marks.
- Calculations automatically check the numerical result and unit. Their working is visible for your inspection; this version does not automatically assess each method step.
- Refresh to see newly submitted work. Live push updates are not required for this pilot.
- A new practice session retains the previous session in your dashboard.
- The CSV export includes all sessions matching the current search, across pages, and contains personal student records.

## Local development (optional)

```bash
npm ci
npm run build
npm test
python -m http.server 8000 --directory dist
```

Open `http://localhost:8000`. Without configuration this is demo mode. For a connected local test, fill the two PUBLIC values in `dist/config.js` before building, or set the two environment variables in your shell. Add the local origin to Supabase's permitted redirect URLs when testing invitations. Do not commit secret credentials. Vercel environment variables are the recommended production configuration.

## Troubleshooting

| Symptom | Check |
|---|---|
| “Demo mode” after deployment | Both environment variables are set for that deployment environment; redeploy after setting them. |
| Vercel only shows “Key” and “Value” | Type `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` as two separate Keys, then paste their actual values. See step 6. |
| Email provider or sign-up switches are missing from URL Configuration | Go to **Authentication → Sign In / Providers**. See step 7B. |
| Unsure what “root URL” means | Use your main Vercel website address, with a trailing slash, in both Site URL and Redirect URLs. See step 7A. |
| Question count is 0 | Run `supabase/02-questions.sql` in the same project and repeat the SQL Editor check in step 3. |
| Sign-in code never arrives | SMTP provider, verified sender, spam folder, existing Auth account, rate limits and the Magic Link template's `{{ .Token }}`. |
| “Email is not registered” | Student roster entry is active; spelling matches the invited Auth email; teacher role has been added for your own account. |
| “Could not find function” / missing table | Run both SQL installation scripts in the SAME Supabase project whose URL is configured in Vercel. |
| “Teacher access required” | Run `03-teacher.sql` for the correct existing Auth email; refresh/sign in again. |
| Vercel returns 404 | The repository includes the complete project, build is `npm run build`, and output is `dist`. |
| Vercel cannot import a private organisation repo | Use the required Pro or Enterprise team and confirm GitHub organisation app access. |
| Student cannot pass Vercel's initial login page | Hosting viewer access is separate from the trainer's student account. Keep protection enabled and grant the intended viewer access. |
| Save failed | Keep the tab open and retry. The app does not advance the step until the server confirms the save. Repeated requests preserve the first submitted result. |
| Teacher has no sessions | Register and invite a test student; a session is created when they first check their command/topic choices. |

## Data handling and question changes

The sign-in page explains what is saved and who can see it. Use appropriate student/parent permissions and your academy's retention arrangements. Store exported files privately. To delete a learner's records, the project owner can delete that Auth user in Supabase (sessions and attempts cascade), then remove their email from the private roster. Do not delete accounts merely to pause access; disable the roster entry instead.

Question content and scoring are versioned as `kkf-v1`. Do not edit the answer key in place for an active cohort. A new question set needs a new version, a matching frontend catalogue and an explicit database migration, so old records keep their meaning.

## Validation supplied with this project

The test suite runs the real schema and backend functions in PGlite (Postgres in WebAssembly), testing student/teacher permissions and scoring. DOM tests exercise the practice flow without a browser. CSV and hydration tests check reporting and session recovery.

These checks do not replace an end-to-end test against YOUR live Supabase project, your SMTP provider and Vercel deployment. Browser-based visual QA was unavailable in the build environment.

## Official references

- [Supabase publishable and secret keys](https://supabase.com/docs/guides/getting-started/api-keys)
- [Supabase authentication settings and provider locations](https://supabase.com/docs/guides/auth/general-configuration)
- [Supabase passwordless email sign-in](https://supabase.com/docs/guides/auth/auth-email-passwordless)
- [Supabase custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp)
- [Supabase row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase database functions](https://supabase.com/docs/guides/database/functions)
- [Vercel GitHub deployments](https://vercel.com/docs/git/vercel-for-github)
- [Vercel build configuration](https://vercel.com/docs/builds/configure-a-build)
- [Vercel deployment protection](https://vercel.com/docs/deployment-protection)
