# Validation · 28 October 2026

The Super Admin upgrade is prepared for the existing Vercel + Supabase application. It has not been applied to the live Supabase project or deployed to Vercel.

## Completed checks

- `npm test`: **62 passed, 0 failed**. This includes 22 new upgrade tests and the existing 40 trainer/resource-gate tests.
- `npm run build`: succeeded. It bundles the official browser Supabase SDK and generates the single-file backend copy for the Supabase dashboard editor. The local frontend configuration remains blank, so local publication would be explicitly labelled demo mode. Vercel supplies the existing public environment values during its build.
- Ten upgrade database tests execute the original schema and upgrade in PGlite (real Postgres in WebAssembly), using separate anonymous, student, teacher and service roles. They cover migration reruns, retained Auth IDs/results/reviews, unassigned teacher denial through direct table queries and RPCs, multiple teacher assignments, assignment removal, disabled accounts, Super Admin-only provisioning, duplicate registration and invitation reservation.
- Nine backend handler tests use mocked Supabase Auth/admin calls. They cover actual caller verification, current database authorisation, fixed invitation redirects, commit-before-invite ordering, duplicate creation races, confirmed-account reuse, uncertain delivery, retry cooldowns and invalid inputs. They do not send real email.
- Three new DOM tests cover Super Admin registration and assignments, failed-request draft retention, versioned account edits, teacher denial on the admin page, and student denial on the teacher page without a reusable OTP form.
- Existing tests continue to cover all eight activities, server scoring, calculation marking, answer persistence/retry, student isolation, teacher feedback, safe HTML/CSV output, and the deferred Cloudflare resource gate.
- Desktop browser visual review used internal static fixtures generated from the production admin DOM with fictional accounts. The add-person form, people directory and student assignment editor were inspected. This is layout verification, not a live Auth/backend test. Mobile browser visual review was not performed.
- Static checks cover HTML ID uniqueness, JavaScript syntax, whitespace, retained Sites identity, and separation of the server function from public assets.

## Still required on the live application

Follow `ADMIN_UPGRADE.md` or the identical plain-text `ADMIN_UPGRADE.txt`:

1. Apply `05-super-admin.sql` to the existing database and compare pre/post session and answer counts.
2. Bootstrap the existing verified teacher as Super Admin using `06-bootstrap-super-admin.sql`.
3. Deploy the `kkf-admin` Edge Function and its exact `KKF_SITE_URL` setting.
4. Commit the updated source to the existing repository and let Vercel deploy it.
5. Assign existing students, then verify invitation delivery, two-teacher isolation, account disable/reactivation, reports, CSV export and review history on the deployed application.

No live provider settings, permissions, accounts or invitations were changed during source preparation. The earlier guided setup confirmed student saving and teacher reporting on the previous Vercel version; it does not verify this upgrade.

The optional Cloudflare migration and downloadable-resource protection remain deferred. Their retained local tests are not evidence of a live Cloudflare deployment or protected resources on the current Vercel host.
