import { mountAuth } from "./auth-ui.js";
import { rpc } from "./backend.js";
import { ACTIVITIES } from "./data.js";
import { esc, reportTotals, rowPoints, assessment, creditLabel, buildCsv, reviewHistoryHtml } from "./utils.js";
const $ = (id) => document.getElementById(id);
let items = [], offset = 0, total = 0, search = "", selectedId = null, openQuestion = null, roster = [], loading = false, viewer = null, teacherFilter = null, fromDate = null, toDate = null;
function status(text, error = false) {
  $("report-status").textContent = text;
  $("report-status").classList.toggle("sync-error", error);
}
function overview() {
  const done = items.filter((s) => s.completed_at), average = done.length ? (done.reduce((n, s) => n + reportTotals(s).points, 0) / done.length).toFixed(1) : "\u2014";
  $("report-overview").innerHTML = `<div class="dashboard-stats"><div><strong>${total}</strong><span>Matching sessions</span></div><div><strong>${average}</strong><span>Average /32 \xB7 completed on this page</span></div><div><strong>${items.reduce((n, s) => n + reportTotals(s).pending, 0)}</strong><span>Written answers awaiting teacher review \xB7 this page</span></div></div>`;
  $("session-rows").innerHTML = items.length ? items.map((s) => {
    const t = reportTotals(s);
    return `<tr><td><button class="student-link" data-session="${s.id}">${esc(s.display_name || s.email)}</button>${s.display_name ? `<span class="table-secondary">${esc(s.email)}</span>` : ""}</td><td>${esc(new Date(s.started_at).toLocaleString())}</td><td><strong>${t.points} / 32</strong></td><td>${t.finished} / 8</td><td>${t.pending ? `${t.pending} awaiting review` : "Up to date"}</td></tr>`;
  }).join("") : '<tr><td colspan="5">No matching sessions yet. Registered students appear here after they check their first choices.</td></tr>';
  $("pagination").innerHTML = `<button class="text-button" id="previous-page" ${offset === 0 ? "disabled" : ""}>\u2190 Previous</button><span>${total ? `${offset + 1}\u2013${Math.min(offset + 25, total)} of ${total}` : "0 sessions"}</span><button class="text-button" id="next-page" ${offset + 25 >= total ? "disabled" : ""}>Next \u2192</button>`;
  document.querySelectorAll("[data-session]").forEach((b) => b.onclick = () => {
    selectedId = b.dataset.session;
    openQuestion = null;
    detail();
    $("session-detail").focus();
    $("session-detail").scrollIntoView({ behavior: "instant", block: "start" });
  });
  $("previous-page").onclick = () => load(Math.max(0, offset - 25));
  $("next-page").onclick = () => load(offset + 25);
}
async function load(nextOffset = offset) {
  if (loading) return;
  loading = true;
  status("Loading private results\u2026");
  try {
    const data = await rpc("kkf_report", { p_search: search, p_offset: nextOffset, p_teacher: teacherFilter, p_from: fromDate, p_to: toDate });
    offset = nextOffset;
    items = data.items;
    total = data.total;
    overview();
    detail();
    status("Results loaded. Written self-review is provisional until reviewed by a teacher.");
  } catch (err) {
    items = []; total = 0; selectedId = null;
    $("session-rows").innerHTML = ""; $("session-detail").innerHTML = ""; $("report-overview").innerHTML = ""; $("pagination").innerHTML = "";
    status(err.message, true);
  } finally {
    loading = false;
  }
}
function detail() {
  const s = items.find((v) => v.id === selectedId);
  if (!s) {
    $("session-detail").innerHTML = "";
    return;
  }
  $("session-detail").innerHTML = `<article class="practice-card detail-card"><div class="card-body"><p class="section-label">SESSION DETAIL</p><h2>${esc(s.display_name || s.email)}</h2><p class="review-help">${esc(s.email)} \xB7 ${esc(new Date(s.started_at).toLocaleString())}<br>Score includes automatic and labelled self-reviewed or teacher-reviewed points. For written answers, teacher review replaces the answer-practice points.</p><div class="review-list">${ACTIVITIES.map((q, i) => {
    const a = s.attempts.find((v) => v.question_id === q.id);
    return `<details ${q.id === (openQuestion || ACTIVITIES[0].id) ? "open" : ""}><summary><span>${i + 1}. ${q.command} \xB7 ${q.subject}</span><strong>${a ? rowPoints(a) + " / 4" : "\u2014"}</strong></summary><p><strong>${esc(q.question)}</strong></p>${a ? `<p class="assessment-label">${creditLabel(a)} \xB7 ${assessment(a)}</p><p><strong>Command:</strong> ${esc(a.selected_command)} \u2014 ${a.command_correct ? "correct" : "incorrect; expected " + q.command}<br><strong>Topic:</strong> ${esc(a.selected_topic)} \u2014 ${a.topic_correct ? "correct" : "incorrect; expected " + esc(q.topic)}</p><p><strong>Student answer</strong></p><p class="saved-answer">${a.submitted_at ? esc(a.answer) : "Answer not submitted yet."}${q.command === "Calculate" && a.submitted_at ? `
Result: ${esc(a.numeric_value)} ${esc(a.unit === "m/s2" ? "m/s\xB2" : a.unit === "none" ? "(no unit)" : a.unit)}` : ""}</p><p><strong>Model:</strong> ${esc(q.model)}</p>${reviewHistoryHtml(a.review_history || [])}${a.finished_at && !a.auto_checks ? `<form class="teacher-review" data-question="${q.id}"><h3 class="review-title">Teacher review \xB7 up to 2 answer points</h3><p class="review-help">The student awarded ${a.self_checks.filter(Boolean).length} / 2. Check the criteria supported by their original answer. Command and topic marks stay fixed.</p>${q.criteria.map((c, j) => `<label class="review-check"><input type="checkbox" name="criterion-${j}" ${(a.teacher_checks ?? [false, false])[j] ? "checked" : ""}><span>${esc(c)}</span></label>`).join("")}<label class="answer-label" for="feedback-${q.id}">Feedback (optional)</label><textarea id="feedback-${q.id}" name="feedback" maxlength="1000">${esc(a.teacher_feedback)}</textarea><button class="primary" type="submit">Save teacher review</button><p class="review-save-status" role="status"></p></form>` : a.auto_checks && a.submitted_at ? `<p>Number: ${a.auto_checks[0] ? "correct" : "incorrect"} \xB7 Unit: ${a.auto_checks[1] ? "correct" : "incorrect"}. Working is available for teacher inspection.</p>` : "<p>This activity can be reviewed after the student finishes it.</p>"}` : "<p>Not attempted.</p>"}</details>`;
  }).join("")}</div></div></article>`;
  document.querySelectorAll(".teacher-review").forEach(form => form.addEventListener("input", () => delete form.dataset.requestId));
  document.querySelectorAll(".teacher-review").forEach((form) => form.onsubmit = async (e) => {
    e.preventDefault();
    const button = e.submitter;
    button.disabled = true;
    const output = form.querySelector(".review-save-status");
    output.textContent = "Saving\u2026";
    try {
      const question = form.dataset.question, current = s.attempts.find(a => a.question_id === question), checks = [0, 1].map((i) => form.elements.namedItem("criterion-" + i).checked);
      const row = await rpc("kkf_teacher_review", { p_session_id: s.id, p_question_id: question, p_checks: checks, p_feedback: form.elements.namedItem("feedback").value, p_expected_version: current.review_version ?? 0, p_request_id: form.dataset.requestId ||= crypto.randomUUID() });
      s.attempts[s.attempts.findIndex((a) => a.question_id === question)] = row;
      openQuestion = question;
      await load(offset);
      status("Teacher review saved. The score has been updated.");
    } catch (err) {
      output.textContent = err.message;
      button.disabled = false;
    }
  });
}
async function loadRoster() {
  roster = await rpc("kkf_roster");
  $("roster-list").innerHTML = roster.length ? `<div class="table-wrap"><table class="results-table"><thead><tr><th>Student</th><th>Email</th><th>Year group</th><th>Access</th><th>Last sign-in</th></tr></thead><tbody>${roster.map(r => `<tr><td>${esc(r.display_name || r.email)}</td><td>${esc(r.email)}</td><td>${esc(r.year_group)}</td><td>${r.active ? "Active" : "Disabled"}</td><td>${r.last_sign_in_at ? esc(new Date(r.last_sign_in_at).toLocaleString()) : "Not signed in yet"}</td></tr>`).join("")}</tbody></table></div>` : "<p>No students have been assigned to you yet. Ask the Super Admin to assign students.</p>";
}
$("report-filter").onsubmit = (e) => {
  e.preventDefault();
  search = $("search-email").value.trim();
  teacherFilter = $("filter-teacher").value || null;
  fromDate = $("filter-from").value ? new Date($("filter-from").value + "T00:00:00").toISOString() : null;
  if ($("filter-to").value) {
    const end = new Date($("filter-to").value + "T00:00:00"); end.setDate(end.getDate() + 1); toDate = end.toISOString();
  } else toDate = null;
  selectedId = null;
  load(0);
};
$("refresh-report").onclick = () => load();
$("export-report").onclick = async () => {
  const b = $("export-report");
  b.disabled = true;
  status("Preparing a private CSV export\u2026");
  try {
    const all = /* @__PURE__ */ new Map();
    let before = null, start = 0, count;
    do {
      const data = await rpc("kkf_report", { p_search: search, p_offset: start, p_before: before, p_teacher: teacherFilter, p_from: fromDate, p_to: toDate });
      before = data.snapshot_at;
      data.items.forEach((s) => all.set(s.id, s));
      count = data.total;
      start += 25;
    } while (start < count);
    const blob = new Blob([buildCsv([...all.values()], ACTIVITIES)], { type: "text/csv;charset=utf-8" }), url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url;
    a.download = "kkf-results-" + (/* @__PURE__ */ new Date()).toISOString().slice(0, 10) + ".csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1e3);
    status(`Exported ${all.size} matching sessions. The CSV contains student records; store it privately.`);
  } catch (err) {
    status(err.message, true);
  } finally {
    b.disabled = false;
  }
};
await mountAuth({ teacherOnly: true, onReady: async profile => {
  viewer = profile;
  $("teacher-heading").textContent = profile.is_super_admin ? "ALL ACADEMY ACTIVITY" : "YOUR STUDENTS";
  $("report-scope").textContent = profile.is_super_admin ? "All academy sessions, answers and feedback." : "Activities and results for students assigned to you.";
  $("roster-title").textContent = profile.is_super_admin ? "Academy students" : "Assigned students";
  $("admin-tools").hidden = !profile.is_super_admin;
  $("teacher-filter-field").hidden = !profile.is_super_admin;
  if (profile.is_super_admin) {
    const directory = await rpc("kkf_admin_people", { p_search: "", p_role: "", p_offset: 0 });
    $("filter-teacher").innerHTML = '<option value="">All teachers</option>' + directory.teachers.map(t => `<option value="${esc(t.user_id)}">${esc(t.display_name || t.email)}${t.active ? "" : " (disabled)"}</option>`).join("");
  }
  $("teacher-content").hidden = false;
  await load(0);
  await loadRoster();
}, onSignedOut: async () => {
  items = [];
  roster = [];
  viewer = null;
  $("admin-tools").hidden = true;
  selectedId = null;
  $("teacher-content").hidden = true;
  $("session-rows").innerHTML = "";
  $("session-detail").innerHTML = "";
  $("roster-list").innerHTML = "";
  $("report-overview").innerHTML = "";
} });
