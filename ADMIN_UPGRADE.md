# KKF Academy: Super Admin upgrade for the existing Vercel site

This upgrades the working Vercel + Supabase trainer. Keep the existing project, Auth accounts, questions, sessions and answers. After the one-time upgrade, register teachers and students entirely through the app.

## What this version does

| Role | Access |
|---|---|
| Super Admin | Register teachers/students, manage account access and assignments, view all academy activity and account audit records |
| Teacher | View and review only assigned students; no account creation or assignment changes |
| Student | Complete practice and view their own records |

One student can have several assigned teachers. Teachers can have several students. Removing an assignment removes that teacher's future access to the student's records, including history. Previous answers and reviews are retained.

**The code is prepared and locally tested; applying it to your Supabase project and deploying it to Vercel are still required.** No provider accounts were accessed during preparation, and no real invitations were sent by the tests.

## Upgrade order

1. Download and extract the full source package.
2. Run the new database upgrade, not the original installation.
3. Designate your existing teacher account as Super Admin once.
4. Deploy the account-management function in Supabase.
5. Update your existing GitHub repository and let Vercel deploy.
6. Sign in as Super Admin, assign existing students and perform the live checks.

## 1. Open the supplied files

On Windows, right-click the downloaded ZIP and choose **Extract All**. Open SQL, TypeScript and text files with Notepad or your code editor.

The package also contains **ADMIN_UPGRADE.txt**, which opens as a normal text file. This guide is also readable on GitHub.

Keep your previous source version so the code can be compared if needed. Do not replace your live Supabase project or create a new one.

## 2. Upgrade the existing database

Before upgrading, note the existing counts:

```sql
select count(*) as sessions from public.kkf_sessions;
select count(*) as answers from public.kkf_attempts;
```

Then:

1. Open **Supabase → your existing project → SQL Editor → New query**.
2. Open **supabase/05-super-admin.sql** from the extracted package.
3. Copy the entire file into the SQL Editor and click **Run**.
4. Expect **Success. No rows returned**, or a similar success message.
5. Check that the session and answer counts above have not changed.

This migration imports existing teachers and students into the new account directory. It preserves old tables and existing results. It also removes the pilot's academy-wide teacher access.

**Existing ordinary teachers initially have no student assignments.** They will see no student records until you assign students in the new app. The Super Admin can see all existing activity after the next step.

Do not rerun **01-schema.sql**, **02-questions.sql** or **03-teacher.sql** on the existing project.

## 3. Designate your current teacher account as Super Admin

1. Open **supabase/06-bootstrap-super-admin.sql**.
2. Replace **REPLACE_WITH_YOUR_EXISTING_TEACHER_EMAIL** with the teacher email that already signs in successfully.
3. Keep the single quotation marks around the email.
4. Run that file in a new Supabase SQL Editor query.

This does not create another login or change a password. The account must already be a verified, active teacher.

This one-time bootstrap gives your existing account the Super Admin permission. Future teachers and students do not need manual SQL or manual Auth invitations.

## 4. Deploy the account-management backend through the Supabase dashboard

This function performs account creation using server credentials. Those credentials stay in Supabase and are never placed in the website.

### Set the website address

1. Open **Supabase → Edge Functions → Secrets**.
2. Add this entry:

| Key | Value |
|---|---|
| KKF_SITE_URL | https://kkf-exam-trainer.vercel.app/ |

3. Save.

Use that exact root URL, including the trailing slash. It controls the permitted website origin and invitation destination. If you later deliberately move the site, update this value and the Supabase Auth redirect settings together.

Supabase provides the server credentials to hosted Edge Functions automatically. The function uses its default secret key, with support for the older service-role key. You do not need to copy a secret into Vercel, GitHub, the browser configuration or chat.

### Create the function

1. Open **Supabase → Edge Functions**.
2. Click **Deploy a new function → Via Editor**.
3. Name it exactly **kkf-admin**.
4. Open **supabase/kkf-admin-dashboard.ts** from the extracted package.
5. Copy the whole file into the editor's **index.ts**, replacing the example code.
6. Click **Deploy function** and wait for success.
7. Keep the function's **Verify JWT** / JWT verification setting enabled.

The supplied dashboard file is self-contained: no extra local handler file is needed in the dashboard editor. Its SDK import comes from the official npm package.

If deploying by CLI instead, use the source directory **supabase/functions/kkf-admin/** and the supplied **supabase/config.toml**:

```bash
supabase functions deploy kkf-admin --project-ref YOUR_PROJECT_REF
```

The function independently verifies the signed-in user with Supabase Auth and rechecks current Super Admin membership in the database for every action. A publishable key or client-supplied role is insufficient.

The dashboard's generic function tester may use an API key rather than your signed-in app user. An unauthorised response there is expected. Use the signed-in app for the real provisioning test.

## 5. Update the existing GitHub repository and Vercel deployment

Upload/commit the extracted project files to the **same repository already connected to Vercel**. Preserve your repository identity and production branch.

Include the new files and the updates to existing files. In particular:

- **dist/admin.html**, **dist/admin.js**
- Updated **dist/auth-ui.js**, **backend.js**, **teacher.html**, **teacher.js**, **app.js**, **utils.js**, **styles.css**
- Updated **scripts/build.mjs** and new **scripts/build-admin-function.mjs**
- All supplied **supabase/** upgrade and function files
- Existing **package.json**, **package-lock.json**, **vercel.json**, frontend files and questions

If uploading through GitHub's web interface, preserve subfolder paths. Do not upload the ZIP itself as the application. The contents must appear at the project root, with **dist/** and **supabase/** as folders.

Vercel should deploy the new commit automatically. If needed, open the project in Vercel and redeploy.

Keep the existing settings:

| Setting | Value |
|---|---|
| Framework | Other |
| Build command | npm run build |
| Output directory | dist |
| SUPABASE_URL | Existing project URL |
| SUPABASE_PUBLISHABLE_KEY | Existing sb_publishable_... value |

No new frontend secret or Vercel environment variable is required.

This upgrade does not change the Vercel deployment-protection setting. You chose to leave that hosting gate off while completing the trainer; the separate downloadable-resource protection task remains pending.

## 6. Open Super Admin and assign existing students

1. In your normal browser, sign in using your existing teacher email and a fresh sign-in code if needed.
2. Click **Manage people**, or enter your site's **/admin.html** address in that same signed-in tab.
3. Your account should show **Super Admin**.
4. Open **People & assignments** and find an existing student.
5. Click **Edit**, select their teachers and click **Save details and access**.
6. Repeat for each existing student.

You may assign your own administrator/teacher account as one of the teachers, but Super Admin access to all activity does not depend on an assignment.

Students without assignments can still practise and save their own work. Their results are visible to the Super Admin.

## 7. Add a new teacher or student in one place

1. Open **Manage people → Add a person**.
2. Choose **Teacher** or **Student**.
3. Enter full name and email.
4. For a student, optionally enter a year group and select one or more teachers.
5. Click **Create and send invitation**.

The backend creates or reuses the Auth identity, saves academy membership and assignments, then requests the invitation. The email is not automatically confirmed.

You no longer separately register that person through Supabase Authentication.

If the same email already has the same role, its identity and existing details are preserved. Use **Edit** to change existing details and assignments. Conflicting roles are rejected rather than silently overwritten.

For the first version, an account's email and Teacher/Student type are fixed. Editable details are name, year group, active status and student assignments. This prevents an accidental account-type change from affecting existing results.

### Invitation status

- **Active:** the account is enabled and its email has been verified.
- **Invited:** Supabase accepted the invitation for sending; this does not prove inbox delivery.
- **Invitation needs retry:** account setup succeeded, but sending could not be confirmed. The person may still have received an email.
- **Setup needed:** an older roster record has no connected Auth identity yet; use **Finish setup**.
- **Disabled:** app access is disabled, while previous answers and reviews remain.

Use **Retry invitation** for an unverified account. The backend enforces a one-minute interval to avoid duplicate sends. A confirmed existing account can simply sign in with the usual email code; no new invitation is sent.

An invitation error does not delete or recreate an account. Retrying the same email reuses its identity.

## 8. Live verification before using the new controls with your class

Use your Super Admin account, two teacher accounts and two separate test student accounts.

1. Create a teacher and a student from the app. Confirm their invitations arrive and they can sign in.
2. Confirm their accounts also appear automatically in Supabase Auth without manual registration.
3. Assign Student A to Teacher A. Confirm Teacher A sees A's roster entry, sessions and answers.
4. Confirm Teacher B cannot see Student A in the roster, reports, searches or CSV export.
5. Assign Student A to both teachers. Confirm both can now view and review A.
6. Remove Teacher A's assignment. Refresh that teacher's page; A must disappear, including historical sessions.
7. Confirm the Super Admin can still see both students' activity.
8. Try opening **/admin.html** as a teacher and as a student. Both must receive an access-required message.
9. Disable a test account and confirm it can no longer load its app records. Reactivate it and confirm earlier work is retained.
10. Save a written-answer teacher review. Refresh and confirm named, dated review history and the current score.

Only perform invitation tests with inboxes you control or recipients you deliberately authorise.

The automated tests check these permission paths and provisioning failures locally. They do not replace this live check of your deployed SQL, function and email provider.

## Reviews, reports and everyday use

- Teachers use **/teacher.html** and see only assigned students.
- The Super Admin uses **/teacher.html** for all activity, with name/email, assigned-teacher and date filters.
- CSV export applies the same permission and filter rules as the report.
- Teachers cannot create users, disable accounts or assign students.
- Account changes and invitation attempts appear in the Super Admin's account activity log.
- Written-answer reviews retain author, date, feedback and awarded criteria. The latest accepted review determines the written-answer points.
- If another teacher saves a review while an older form is open, the older save is refused with a refresh instruction. Earlier reviews are not erased.
- Sign out before sharing a device. App sessions remain scoped to a browser tab.

## Troubleshooting

| What you see | What to check |
|---|---|
| Super Admin access required | Run 06-bootstrap-super-admin.sql for the exact existing teacher email; refresh/sign in again. |
| Account management unavailable | Run 05-super-admin.sql and deploy the function named kkf-admin. |
| Function not found / network error on Create | Confirm the Edge Function is deployed and KKF_SITE_URL is exactly the live website root. |
| Teacher sees no students | Assign students from Super Admin. Existing teachers are not automatically assigned everyone. |
| Registered user has the wrong email/type | Disable the incorrect entry and register the correct account; do not delete existing results casually. |
| Invitation could not be confirmed | Keep the account. Check inbox/spam and Supabase Auth logs/SMTP settings; retry after one minute. |
| This account changed / another review was saved | Refresh and reopen the latest record before making the change again. |
| New fields do not appear | Confirm Vercel deployed the new commit; refresh the page. |
| Old code gives a permission error on registration | Old manual roster writes were intentionally closed. Use the new Super Admin screen. |

## Official references

- https://supabase.com/docs/reference/javascript/auth-admin-createuser
- https://supabase.com/docs/reference/javascript/auth-admin-inviteuserbyemail
- https://supabase.com/docs/reference/javascript/auth-getuser
- https://supabase.com/docs/guides/functions/quickstart-dashboard
- https://supabase.com/docs/guides/functions/secrets
- https://supabase.com/docs/guides/functions/auth-headers
