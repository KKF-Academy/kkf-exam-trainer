// supabase/functions/kkf-admin/index.ts
import { createClient } from "npm:@supabase/supabase-js@2.118.0";

// supabase/functions/kkf-admin/handler.js
var RequestError = class extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
};
var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function emailOf(value) {
  if (typeof value !== "string") throw new RequestError(400, "Enter a valid email address.");
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new RequestError(400, "Enter a valid email address.");
  return email;
}
function personInput(body) {
  if (!["teacher", "student"].includes(body.role)) throw new RequestError(400, "Choose Teacher or Student.");
  if (typeof body.display_name !== "string" || !body.display_name.trim() || body.display_name.trim().length > 80) throw new RequestError(400, "Enter a name up to 80 characters.");
  const year = body.year_group ?? "";
  if (typeof year !== "string" || year.trim().length > 30) throw new RequestError(400, "Enter a year group up to 30 characters.");
  const ids = body.teacher_ids ?? [];
  if (!Array.isArray(ids) || ids.length > 100 || ids.some((id) => typeof id !== "string" || !UUID.test(id))) throw new RequestError(400, "Choose valid teacher assignments.");
  if (body.role === "teacher" && ids.length) throw new RequestError(400, "Teachers cannot be assigned as students.");
  return {
    email: emailOf(body.email),
    role: body.role,
    display_name: body.display_name.trim(),
    year_group: body.role === "student" ? year.trim() : "",
    teacher_ids: [...new Set(ids)].sort()
  };
}
function createAdminHandler({ createClient: createClient2, env }) {
  const site = new URL(env.KKF_SITE_URL || "https://kkf-exam-trainer.vercel.app/");
  if (site.protocol !== "https:" || site.username || site.password || site.search || site.hash || site.pathname !== "/") throw new Error("KKF_SITE_URL must be a canonical HTTPS root URL.");
  const origin = site.origin;
  const json = (value, status = 200, cors = true) => new Response(JSON.stringify(value), { status, headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Vary": "Origin",
    ...cors ? { "Access-Control-Allow-Origin": origin } : {}
  } });
  return async (request) => {
    if (request.headers.get("Origin") && request.headers.get("Origin") !== origin) return json({ error: "This website is not permitted." }, 403, false);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
      "Vary": "Origin"
    } });
    if (request.method !== "POST") return json({ error: "Use POST for account management." }, 405);
    try {
      if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new RequestError(503, "Account management has not been configured yet.");
      const bearer = /^Bearer\s+(\S+)$/i.exec(request.headers.get("Authorization") || "");
      if (!bearer || bearer[1].split(".").length !== 3) throw new RequestError(401, "Please sign in again.");
      const service = createClient2(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        global: { fetch: (url, options) => fetch(url, { ...options, signal: AbortSignal.timeout(15e3) }) }
      });
      const { data: identity, error: identityError } = await service.auth.getUser(bearer[1]);
      if (identityError || !identity?.user?.id) throw new RequestError(401, "Please sign in again.");
      const actor = identity.user.id;
      async function operation(action, data = {}) {
        const { data: result, error } = await service.rpc("kkf_admin_service", { p_actor: actor, p_action: action, p_data: data });
        if (error) {
          const status = error.code === "42501" ? 403 : ["40001", "23505"].includes(error.code) ? 409 : ["P0001", "22P02", "22023"].includes(error.code) ? 400 : 503;
          throw new RequestError(status, status === 503 ? "Account management is unavailable. Check the upgrade setup and try again." : error.message);
        }
        return result;
      }
      await operation("authorize");
      const raw = await request.text();
      if (new TextEncoder().encode(raw).length > 16384) throw new RequestError(413, "This request is too large.");
      let body;
      try {
        body = JSON.parse(raw);
      } catch {
        throw new RequestError(400, "The account request was not valid.");
      }
      if (!body || typeof body !== "object" || Array.isArray(body)) throw new RequestError(400, "The account request was not valid.");
      if (!["create", "update", "resend"].includes(body.action)) throw new RequestError(400, "Choose a valid account action.");
      const email = emailOf(body.email);
      if (body.action === "update") {
        const input = personInput(body);
        if (typeof body.active !== "boolean" || !Number.isSafeInteger(body.revision) || body.revision < 1) throw new RequestError(400, "Refresh this account before saving.");
        await operation("update", { ...input, active: body.active, revision: body.revision });
        return json({ ok: true, message: "Account details and access updated." });
      }
      let registration = null;
      if (body.action === "create") {
        const input = personInput(body);
        let state2 = await operation("validate", input);
        let userId = state2.auth_user_id;
        if (!userId) {
          let created;
          try {
            created = await service.auth.admin.createUser({ email, email_confirm: false });
          } catch {
            created = null;
          }
          userId = created?.data?.user?.id;
          if (!userId) {
            state2 = await operation("lookup", { email });
            userId = state2.auth_user_id;
          }
          if (!userId) throw new RequestError(502, "Account setup could not be confirmed. Retry using the same email address.");
        }
        registration = await operation("register", { ...input, user_id: userId });
        if (!registration.active) return json({ ok: true, invitation_status: "disabled", message: "This account already exists and is disabled. Edit it to reactivate access." });
      }
      const state = await operation("lookup", { email });
      if (!state.person?.user_id) throw new RequestError(409, "Account setup is incomplete. Use Create and invite to finish it.");
      if (!state.person.active) throw new RequestError(409, "Reactivate this account before sending an invitation.");
      if (state.email_confirmed) return json({
        ok: true,
        created: registration?.created ?? false,
        invitation_status: "existing_account",
        message: "Account ready. This email is already verified; they can use the trainer's email-code sign-in."
      });
      const reservation = await operation("reserve_invitation", { email });
      if (!reservation.send) return json({
        ok: true,
        invitation_status: reservation.reason,
        message: reservation.reason === "cooldown" ? "The account is ready. An invitation was recently attempted; check the inbox or retry after one minute." : "Account ready. They can sign in using their existing verified email."
      });
      let accepted = false;
      let confirmedDuringInvite = false;
      try {
        const { data, error } = await service.auth.admin.inviteUserByEmail(email, { redirectTo: site.href });
        accepted = !error && data?.user?.id === reservation.user_id;
        if (!accepted) confirmedDuringInvite = Boolean((await operation("lookup", { email })).email_confirmed);
      } catch {
      }
      const inviteStatus = accepted ? "sent" : confirmedDuringInvite ? "existing_account" : "retry_needed";
      try {
        await operation("invitation_result", { email, token: reservation.token, status: inviteStatus });
      } catch {
        return json({ ok: true, invitation_status: "unknown", message: "The account is ready, but invitation status could not be recorded. Refresh the account list before retrying." });
      }
      return json({
        ok: true,
        created: registration?.created ?? false,
        invitation_status: inviteStatus,
        message: accepted ? "Account ready. The invitation was accepted for sending; ask them to check their inbox." : confirmedDuringInvite ? "Account ready. Their email is already verified; they can sign in with a code." : "Account ready. Sending the invitation could not be confirmed. Check the inbox or retry the invitation after one minute."
      });
    } catch (error) {
      return json({ error: error instanceof RequestError ? error.message : "Account management could not complete. Refresh and retry." }, error instanceof RequestError ? error.status : 500);
    }
  };
}

// supabase/functions/kkf-admin/index.ts
function adminKey() {
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
    if (typeof keys.default === "string" && keys.default) return keys.default;
  } catch {
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
}
Deno.serve(createAdminHandler({ createClient, env: {
  SUPABASE_URL: Deno.env.get("SUPABASE_URL"),
  SUPABASE_SERVICE_ROLE_KEY: adminKey(),
  KKF_SITE_URL: Deno.env.get("KKF_SITE_URL") || "https://kkf-exam-trainer.vercel.app/"
} }));
