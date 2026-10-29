import { createClient } from "./vendor/supabase.js";
import { CONFIG } from "./config.js";
import { ACTIVITIES } from "./data.js";
import { newSession } from "./engine.js";
const QUIZ_VERSION = "kkf-v1";
const configured = Boolean(CONFIG.supabaseUrl && CONFIG.supabasePublishableKey);
const memory = /* @__PURE__ */ new Map();
const safeStorage = { getItem: (k) => {
  try {
    return sessionStorage.getItem(k);
  } catch {
    return memory.get(k) ?? null;
  }
}, setItem: (k, v) => {
  try {
    sessionStorage.setItem(k, v);
  } catch {
    memory.set(k, v);
  }
}, removeItem: (k) => {
  try {
    sessionStorage.removeItem(k);
  } catch {
  }
  memory.delete(k);
} };
if (configured && (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(CONFIG.supabaseUrl) || !CONFIG.supabasePublishableKey.startsWith("sb_publishable_"))) throw new Error("Invalid public backend configuration. Use a Supabase URL and publishable key.");
const client = configured ? createClient(CONFIG.supabaseUrl, CONFIG.supabasePublishableKey, { auth: { storage: safeStorage, storageKey: "kkf-auth-v1", persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "implicit" } }) : null;
async function rpc(name, params = {}) {
  if (!client) throw new Error("Supabase is not configured.");
  const { data, error } = await client.rpc(name, params);
  if (error) throw new Error(error.message || "The request could not be saved.");
  return data;
}
async function adminRequest(payload) {
  if (!client) throw new Error("Supabase is not configured.");
  const { data, error } = await client.functions.invoke("kkf-admin", { body: payload });
  if (error) {
    let message = "Account management could not complete. Check the setup and retry.";
    try {
      const context = typeof error.context?.clone === "function" ? error.context.clone() : error.context;
      const body = await context?.json();
      if (typeof body?.error === "string") message = body.error;
    } catch { /* Network and platform errors have no JSON response. */ }
    throw new Error(message);
  }
  if (!data?.ok) throw new Error(data?.error || "Account management could not complete.");
  return data;
}
async function currentProfile() {
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) throw new Error("Please sign in again.");
  return rpc("kkf_profile");
}
function applyAttempt(state, row) {
  const i = ACTIVITIES.findIndex((q) => q.id === row.question_id);
  if (i < 0) return state;
  const a = state.attempts[i];
  a.command = row.selected_command;
  a.topic = row.selected_topic;
  a.identified = true;
  a.submitted = Boolean(row.submitted_at);
  a.finished = Boolean(row.finished_at);
  if (a.submitted) {
    a.draft = row.answer;
    a.numeric = row.numeric_value;
    a.unit = row.unit;
  }
  a.review = row.self_checks ?? [false, false];
  a.teacherReview = row.teacher_checks ?? null;
  a.autoChecks = row.auto_checks ?? null;
  a.teacherFeedback = row.teacher_feedback || "";
  if (row.review_history) a.teacherHistory = row.review_history;
  return state;
}
function hydrateSession(session, rows, draft = null) {
  const state = newSession();
  state.sessionId = session.id;
  for (const row of rows) applyAttempt(state, row);
  state.index = state.attempts.findIndex((a) => !a.finished);
  if (state.index < 0) state.index = ACTIVITIES.length;
  if (draft?.sessionId === session.id) {
    const a = state.attempts[state.index], d = draft.attempts?.[state.index];
    if (a && d && !a.submitted) {
      a.draft = d.draft || "";
      a.numeric = d.numeric || "";
      a.unit = d.unit || "";
      if (!a.identified) {
        a.command = d.command || "";
        a.topic = d.topic || "";
      }
    }
    if (a && d && a.submitted && !a.finished && Array.isArray(d.review) && d.review.length === 2 && d.review.every((v) => typeof v === "boolean")) a.review = d.review;
  }
  return state;
}
async function loadLatest(profile, draft) {
  const { data: sessions, error } = await client.from("kkf_sessions").select("*").eq("user_id", profile.id).eq("quiz_version", QUIZ_VERSION).order("started_at", { ascending: false }).order("id").limit(1);
  if (error) throw new Error(error.message);
  if (!sessions.length) return newSession();
  const s = sessions[0];
  const { data: rows, error: e } = await client.from("kkf_attempts").select("*").eq("session_id", s.id);
  if (e) throw new Error(e.message);
  const history = await rpc("kkf_review_history", { p_session_id: s.id });
  return hydrateSession(s, rows.map(row => ({ ...row, review_history: history.filter(h => h.question_id === row.question_id) })), draft);
}
async function ensureSession(state, onId) {
  if (!state.sessionId) {
    state.sessionId = crypto.randomUUID();
    onId?.();
  }
  return rpc("kkf_start_session", { p_id: state.sessionId });
}
async function saveIdentification(state) {
  const a = state.attempts[state.index], q = ACTIVITIES[state.index];
  const row = await rpc("kkf_identify", { p_session_id: state.sessionId, p_question_id: q.id, p_command: a.command, p_topic: a.topic });
  applyAttempt(state, row);
  return row;
}
async function saveAnswer(state) {
  const a = state.attempts[state.index], q = ACTIVITIES[state.index];
  const row = await rpc("kkf_submit_answer", { p_session_id: state.sessionId, p_question_id: q.id, p_answer: a.draft, p_numeric: a.numeric, p_unit: a.unit });
  applyAttempt(state, row);
  return row;
}
async function saveReview(state, index) {
  const a = state.attempts[index], q = ACTIVITIES[index];
  const row = await rpc("kkf_finish_activity", { p_session_id: state.sessionId, p_question_id: q.id, p_self_checks: a.review });
  applyAttempt(state, row);
  return row;
}
export {
  adminRequest,
  QUIZ_VERSION,
  applyAttempt,
  client,
  configured,
  currentProfile,
  ensureSession,
  hydrateSession,
  loadLatest,
  rpc,
  saveAnswer,
  saveIdentification,
  saveReview
};
