# KKF Academy: private Cloudflare hosting with the existing Supabase project

Move the website from Vercel to Cloudflare Workers. Keep the Supabase project, tables, questions, teacher permissions, student roster, email settings and saved results already created.

Cloudflare Access must approve a visitor's exact email address before the website files are served. Supabase separately controls access to student records. A forwarded website URL alone does not grant access. Authorised people can still photograph or copy material they can view.

This guide prepares a new host; it does not mean the Cloudflare account, Access policy or deployment has already been created. Keep the existing Vercel/Sites deployments private throughout the migration.

## 1. Choose the free services deliberately

- Cloudflare Workers supplies the website hosting and a `workers.dev` address. No purchased domain is needed.
- Cloudflare Zero Trust / Access Free has a 50-user limit. Include teachers and test accounts when planning capacity; authenticated identities consume seats.
- Workers Free and Supabase Free have their own usage limits. Access is not an unlimited-user free plan.
- Cloudflare's current Zero Trust onboarding asks for payment details even when selecting Free. Its setup documentation says the Free selection does not incur a charge. Do not select a paid upgrade unintentionally.
- Keep your existing Supabase project. Do not rerun the schema scripts, delete accounts or recreate the database.

## 2. Prepare the private GitHub repository

Merge the supplied source into your existing private exam-trainer repository. Include these additions and updates:

- `cloudflare/worker.js`
- `wrangler.jsonc`
- `scripts/build-cloudflare.mjs`
- `package.json` and `package-lock.json`
- `tests/cloudflare-access.test.js`
- `CLOUDFLARE_SETUP.md`, `README.md`, `SETUP.md` and `.gitignore`

Keep all existing `dist/`, `scripts/` and `supabase/` files. Keep the repository private. The public frontend configuration contains no secret key. SMTP credentials stay in Supabase.

The Worker has an additional cryptographic access check. If access configuration is absent, or the visitor has no valid Cloudflare Access identity, it refuses to deliver resources. This also protects the first deployment while Access is being configured.

## 3. Create your Cloudflare account and Zero Trust organisation

1. Sign up at https://dash.cloudflare.com/sign-up or sign in to your existing account.
2. Enable account two-factor authentication.
3. Open **Zero Trust**. Choose a unique team name, for example a variation of `kkf-academy` if available.
4. Select **Free**, review the user allowance and complete onboarding.
5. Find your actual team domain in Zero Trust settings. It looks like `YOUR-TEAM.cloudflareaccess.com`. This is different from the website's future `workers.dev` address.

Do not send passwords, payment information, API tokens or app passwords in chat.

## 4. Enable email verification in Cloudflare

1. In Zero Trust, open **Integrations → Identity providers**.
2. Select **Add new identity provider → One-time PIN**.
3. Save it.

This enables Cloudflare's own access-verification email. Your existing Gmail SMTP settings in Supabase continue to send the trainer's account invitations and sign-in codes.

## 5. Import the repository as a Worker

Use **Workers & Pages → Create application → Import a repository / Connect GitHub**. Choose the **Workers** deployment path.

Connect GitHub and authorise only the relevant private repository from your organisation. Select the existing exam-trainer repository and production branch.

Use these settings:

| Setting | Value |
|---|---|
| Worker name | `kkf-exam-trainer`, matching `name` in `wrangler.jsonc` |
| Repository root | Root of the project |
| Build command | `npm run build:cloudflare` |
| Deploy command | `npx wrangler deploy` |
| Preview builds | Disabled initially |
| Runtime | Current supported Node 22 or newer build image |

Deploy the Worker with its `wrangler.jsonc` file. Do not upload only `dist/` as an unprotected static site, and do not replace `run_worker_first: true` with asset-first serving.

Before the first build, add these **build variables** in the import form's advanced settings. If the form does not offer them, create the Worker, add them in **Settings → Build → Build variables and secrets**, and retry its build.

| Build variable key | Value |
|---|---|
| `SUPABASE_URL` | The same Supabase project URL you already use in Vercel |
| `SUPABASE_PUBLISHABLE_KEY` | The same `sb_publishable_...` key you already use in Vercel |

Type the keys exactly. These values are compiled into the frontend. They must be available during the build, not only as Worker runtime variables.

Never use a Supabase secret/service-role key or database password. The build deliberately fails if either required value is absent. No database migration is needed.

Deploy. Copy the actual `https://...workers.dev/` address Cloudflare returns. Do not invent an address from the examples.

**A plain “access setup is incomplete” message at this point is expected.** The Worker is refusing to expose files until the Access policy and its runtime values are ready.

## 6. Protect the whole Worker with Cloudflare Access

1. Open **Workers & Pages → your Worker → Access**.
2. Choose **Protect this Worker behind Access**.
3. Choose **All traffic**, covering production and previews.
4. Configure the Access application in **Zero Trust → Access controls → Applications**.
5. Create an **Allow** policy using the **Emails** selector.
6. Add your teacher email and the exact test student email.
7. Enable the **One-time PIN** login method for the application.
8. Set a practical session duration, such as **1 hour**, while testing.
9. Save.

The initial Worker wizard may only offer account-membership or email-domain rules. If so, start with your own Cloudflare account only, then edit the application's policy in Zero Trust and replace it with the exact **Emails** list before adding students.

Do not allow `Everyone`, all `gmail.com` addresses, or a bypass rule. Students are approved visitors, not Cloudflare account/team members.

Worker-level protection covers associated hostnames and previews. If your dashboard only offers hostname-based Access, protect the exact production hostname with no path restriction; leave preview builds disabled. Review every alternate hostname before enabling it.

## 7. Add the Worker's two runtime access values

Open the Access application's details and copy its **Application Audience (AUD)** tag. It is normally a 64-character hexadecimal value.

Open **Workers & Pages → your Worker → Settings → Variables & Secrets** and add:

| Runtime variable key | Value |
|---|---|
| `CF_ACCESS_TEAM_DOMAIN` | Your actual `YOUR-TEAM.cloudflareaccess.com`, without `https://` or a trailing slash |
| `CF_ACCESS_AUD` | The exact AUD tag from this trainer's Access application |

Save/apply the runtime configuration and deploy if the dashboard requests it. Do not put these values in the earlier Supabase build-variable rows.

The Worker's additional check verifies Cloudflare's signature, team issuer, application audience, expiration and email identity on every resource request. It does not accept an email header, URL token or a decoded token without signature verification.

The JWT comes from Cloudflare Access automatically. Students do not copy tokens or change request headers.

## 8. Test the website gate before changing Supabase redirects

Use a fresh private/incognito browser window:

1. Open the Cloudflare website URL.
2. Confirm Cloudflare asks you to verify your email before the trainer loads.
3. Try an address not in the Allow policy. It must not reach the trainer. Cloudflare may show the same generic code-sent message even when it sends no email to an unapproved address.
4. Open `/data.js`, `/engine.js` and `/teacher.html` directly in another fresh signed-out browser. They must also require Access, rather than revealing files.
5. Sign in with your approved teacher email. The trainer should now load and request its existing Supabase sign-in.
6. Check the main hostname and any enabled alternative or preview address. Every route serving the app must be protected.

The local automated tests verify the Worker check. Only this live test verifies your actual Cloudflare policy and deployment.

## 9. Point Supabase invitations to the new address

After the website gate passes the checks above:

1. Open **Supabase → Authentication → URL Configuration**.
2. Set **Site URL** to the actual Cloudflare website root, including `https://` and a trailing slash.
3. Add that exact root to **Redirect URLs**.
4. Save.

For example, if Cloudflare actually issued `https://kkf-exam-trainer.YOUR-SUBDOMAIN.workers.dev/`, use that exact address in both fields. Replace the example with the real address.

Keep the Email provider enabled, public sign-up disabled and the Magic Link template's `{{ .Token }}` code body. The Invite User template must retain its `{{ .ConfirmationURL }}` link.

Existing accounts and teacher permissions still apply. An old invitation may contain the old Vercel redirect; use a fresh sign-in code on the new host for an existing verified account. For an unconfirmed student, first open and authenticate to the new Cloudflare site, then accept their Supabase invitation in that same browser. If the invitation expired or still returns to Vercel, resolve the invitation in Supabase rather than deleting their account.

## 10. Test student records and permissions

Keep your teacher account in your regular browser. Use a separate browser profile/private window for the test student.

1. Ensure the test email is present in the **Cloudflare Emails Allow policy**.
2. Ensure the same email has an active entry in the **trainer's student roster** and an existing **Supabase Auth account**.
3. The student passes Cloudflare's email check, then signs in to the trainer with their Supabase email code.
4. Complete one activity. Deliberately choose one incorrect identification so the error reporting can be checked.
5. In the teacher dashboard, refresh and find their email, original answer and score.
6. Refresh the student page and confirm saved work resumes.
7. Try opening the teacher dashboard as the student. Supabase must refuse teacher access.
8. With a second test account if available, confirm students cannot see each other's records.

Two different services currently perform sign-in. They are not automatically single sign-on. Keep teacher and student test browser sessions separate.

## 11. Add, remove and sign out students

For a new student:

1. Add their exact email to the Cloudflare Access Allow policy.
2. Register that email in the teacher dashboard.
3. Invite the same email through Supabase Authentication if its Auth account does not exist.
4. Send the ordinary Cloudflare website address. It is safe for the URL itself to be known; successful email verification and account permissions are still required.

To remove a student's access:

1. Disable their roster entry in the teacher dashboard.
2. Remove their email from every Cloudflare policy that grants this app access.
3. Revoke that user's active Cloudflare Access sessions in **Team & resources → Users**. Merely removing a seat is not a permanent block if an Allow policy still includes them.
4. Verify that both resources and account records are blocked.

Disabling only the Supabase roster does not end Cloudflare's separate website session. Both systems need updating.

On a shared device, sign out of the trainer and also visit the site's `/cdn-cgi/access/logout` address to end Cloudflare access, then close the browser session. The trainer's current sign-out button ends the Supabase session only. Cloudflare's logout endpoint is handled by Cloudflare, outside the application Worker.

No technical control prevents an authorised student from photographing or copying a resource they can view. Keep the repository private and use your academy's resource-sharing rules.

## 12. Retire the old route after successful testing

Keep Vercel protected during testing. Once the new host works:

1. Give students the verified Cloudflare URL.
2. Keep the old Vercel project inaccessible to students or remove the old deployment using Vercel's project controls.
3. Revoke any Vercel shared access link and remove any test collaborator access.
4. Remove the old Vercel root from Supabase's redirect allowlist when no longer needed.
5. Recheck production, alternate and preview URLs in a signed-out browser.

The original Sites demo has a separate owner-private hosting gate and blank backend configuration. It is not the live Supabase application. Keep it owner-private.

## Troubleshooting

| Symptom | Check |
|---|---|
| Build says both Supabase values are required | Add them to build variables and rebuild; runtime variables alone are insufficient. |
| “Access setup is incomplete” | Add the two runtime Access values, check bare team domain and exact AUD, and apply the configuration. |
| Cloudflare verifies you but the Worker refuses access | Team/AUD match this application; its signing keys are reachable; your device clock and session are valid. Sign out of Access and retry. |
| Unapproved people can load resource files | Stop distribution. Check All traffic, exact-email policy, alternative hosts and `run_worker_first: true`. Do not remove the Worker verification to fix it. |
| Approved students do not receive the Cloudflare code | Their exact email is in the policy, One-time PIN is enabled, and spam filtering permits `noreply@notify.cloudflare.com`. |
| The trainer refuses a student after Cloudflare lets them in | Their Supabase Auth email is verified and their trainer roster entry is active. |
| Student invitation opens Vercel | Update Supabase Site URL and redirect allowlist, then check whether the invitation predates that change. |
| Teacher dashboard is blank after opening another tab | Supabase authentication is stored per tab. Use its in-page Teacher dashboard link or sign in in the new tab. |

## Developer validation

```bash
npm ci
npm test
```

The standard `npm run build` retains the original Sites/Vercel demo behaviour. The Cloudflare build deliberately requires the real public Supabase values.

For a terminal deployment after Cloudflare account login, set the two Supabase build variables in the terminal environment and run `npm run deploy:cloudflare`. Do not publish the folder as a standalone static site.

The source includes signed-token tests for wrong issuers/audiences, forged signatures, missing/expired identities, direct resource requests, service failures and empty configuration. Tests do not configure or validate your live Cloudflare/Supabase accounts.

## Official references

- https://developers.cloudflare.com/workers/configuration/cloudflare-access/
- https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/
- https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/one-time-pin/
- https://developers.cloudflare.com/cloudflare-one/setup/
- https://developers.cloudflare.com/cloudflare-one/faq/getting-started-faq/
- https://www.cloudflare.com/plans/
- https://developers.cloudflare.com/workers/platform/pricing/
- https://developers.cloudflare.com/workers/ci-cd/builds/configuration/
- https://supabase.com/docs/guides/auth/redirect-urls
