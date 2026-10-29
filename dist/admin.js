import { mountAuth } from "./auth-ui.js";
import { rpc, adminRequest } from "./backend.js";
import { esc } from "./utils.js";
const $ = id => document.getElementById(id);
let people = [], teachers = [], total = 0, offset = 0, search = "", role = "", editing = null, loading = false, auditOffset = 0;
const date = value => value ? new Date(value).toLocaleString() : "Not signed in yet";
function message(id, text, error = false) {
  $(id).textContent = text;
  $(id).classList.toggle("sync-error", error);
}
function selectedTeachers(id) { return [...$(id).querySelectorAll("input:checked")].map(input => input.value); }
function teacherChoices(id, selected = []) {
  $(id).innerHTML = teachers.length ? teachers.map(t => `<label class="teacher-choice"><input type="checkbox" value="${esc(t.user_id)}" ${selected.includes(t.user_id) ? "checked" : ""} ${!t.active && !selected.includes(t.user_id) ? "disabled" : ""}><span><strong>${esc(t.display_name || t.email)}</strong><small>${esc(t.email)}${t.active ? "" : " · Disabled"}</small></span></label>`).join("") : '<p class="review-help">No teacher accounts yet. Create a teacher first, or assign this student later.</p>';
}
function teacherName(id) { const t = teachers.find(t => t.user_id === id);return t?.display_name || t?.email || "Former teacher"; }
function accountStatus(p) {
  if (!p.active) return "Disabled";
  if (!p.user_id) return "Setup needed";
  if (p.email_confirmed_at) return "Active";
  return ({ sent: "Invited", sending: "Invitation pending", retry_needed: "Invitation needs retry" })[p.invitation_status] || "Awaiting invitation";
}
function renderPeople() {
  $("people-overview").innerHTML = `<div class="dashboard-stats"><div><strong>${total}</strong><span>Matching accounts</span></div><div><strong>${teachers.length}</strong><span>Teacher accounts</span></div><div><strong>${people.filter(p => p.active && !p.email_confirmed_at).length}</strong><span>Awaiting verification · this page</span></div></div>`;
  $("people-rows").innerHTML = people.length ? people.map((p, i) => `<tr>
    <td><strong>${esc(p.display_name || p.email)}</strong><span class="table-secondary">${esc(p.email)}</span></td>
    <td>${p.is_super_admin ? "Super Admin" : p.role === "teacher" ? "Teacher" : "Student"}<span class="table-secondary">${esc(p.year_group)}</span></td>
    <td><span class="status-chip ${!p.active || p.invitation_status === "retry_needed" ? "status-attention" : ""}">${accountStatus(p)}</span></td>
    <td>${p.role === "student" ? esc((p.teacher_ids || []).map(teacherName).join(", ") || "Unassigned") : `${p.assigned_students?.length || 0} assigned ${p.assigned_students?.length === 1 ? "student" : "students"}`}</td>
    <td>${esc(date(p.last_sign_in_at))}</td>
    <td><div class="row-actions"><button class="text-button" data-edit="${i}">Edit</button>${p.active && !p.email_confirmed_at ? `<button class="text-button" data-invite="${i}">${p.user_id ? "Retry invitation" : "Finish setup"}</button>` : ""}</div></td>
  </tr>`).join("") : '<tr><td colspan="6">No matching accounts.</td></tr>';
  $("people-pagination").innerHTML = `<button class="text-button" id="people-previous" ${offset === 0 ? "disabled" : ""}>← Previous</button><span>${total ? `${offset + 1}–${Math.min(offset + 25, total)} of ${total}` : "0 accounts"}</span><button class="text-button" id="people-next" ${offset + 25 >= total ? "disabled" : ""}>Next →</button>`;
  $("people-previous").onclick = () => loadPeople(Math.max(0, offset - 25));
  $("people-next").onclick = () => loadPeople(offset + 25);
  document.querySelectorAll("[data-edit]").forEach(button => button.onclick = () => openEditor(people[Number(button.dataset.edit)]));
  document.querySelectorAll("[data-invite]").forEach(button => button.onclick = () => retryInvite(people[Number(button.dataset.invite)], button));
}
async function loadPeople(nextOffset = offset) {
  if (loading) return;
  loading = true;
  message("people-status", "Loading academy accounts…");
  try {
    const checked = selectedTeachers("new-teacher-choices");
    const data = await rpc("kkf_admin_people", { p_search: search, p_role: role, p_offset: nextOffset });
    people = data.items; teachers = data.teachers; total = data.total; offset = nextOffset;
    renderPeople(); teacherChoices("new-teacher-choices", checked);
    message("people-status", "Accounts loaded. Only the Super Admin can register people or change assignments.");
  } catch (error) {
    people = []; $("people-rows").innerHTML = ""; $("people-overview").innerHTML = "";
    message("people-status", error.message, true);
  } finally { loading = false; }
}
function openEditor(person) {
  editing = person;
  $("user-editor").hidden = false;
  $("edit-title").textContent = person.display_name || person.email;
  $("edit-email").value = person.email;
  $("edit-name").value = person.display_name;
  $("edit-year").value = person.year_group || "";
  $("edit-active").checked = person.active;
  $("edit-active").disabled = person.is_super_admin;
  $("admin-access-note").hidden = !person.is_super_admin;
  $("edit-year-field").hidden = person.role !== "student";
  $("edit-assignments").hidden = person.role !== "student";
  teacherChoices("edit-teacher-choices", person.teacher_ids || []);
  $("teacher-students").innerHTML = person.role === "teacher" ? `<h3>Assigned students</h3>${person.assigned_students?.length ? `<ul>${person.assigned_students.map(s => `<li>${esc(s.display_name || s.email)} <span class="review-help">${esc(s.email)}</span></li>`).join("")}</ul>` : "<p>No students assigned yet. Edit a student to assign this teacher.</p>"}` : "";
  message("edit-status", "");
  $("edit-title").focus(); $("user-editor").scrollIntoView({ behavior: "smooth", block: "start" });
}
async function retryInvite(person, button) {
  button.disabled = true;
  message("people-status", "Checking account and invitation…");
  try {
    const result = await adminRequest(person.user_id ? { action: "resend", email: person.email } : {
      action: "create", email: person.email, display_name: person.display_name || person.email,
      role: person.role, year_group: person.year_group || "", teacher_ids: person.teacher_ids || []
    });
    await loadPeople(); message("people-status", result.message, ["retry_needed", "unknown"].includes(result.invitation_status));
  } catch (error) { message("people-status", error.message, true); }
  finally { button.disabled = false; }
}
$("new-role").onchange = () => {
  const student = $("new-role").value === "student";
  $("new-year-field").hidden = !student; $("new-assignments").hidden = !student;
};
$("create-person-form").onsubmit = async event => {
  event.preventDefault();
  const button = event.submitter || $("create-person-form").querySelector('button[type="submit"]');
  button.disabled = true; message("create-status", "Creating academy access and preparing the invitation…");
  try {
    const accountRole = $("new-role").value;
    const result = await adminRequest({ action: "create", email: $("new-email").value,
      display_name: $("new-name").value, role: accountRole, year_group: accountRole === "student" ? $("new-year").value : "",
      teacher_ids: accountRole === "student" ? selectedTeachers("new-teacher-choices") : [] });
    $("create-person-form").reset(); $("new-role").onchange(); teacherChoices("new-teacher-choices");
    await loadPeople(0);
    message("create-status", result.message, ["retry_needed", "unknown"].includes(result.invitation_status));
  } catch (error) { message("create-status", error.message, true); }
  finally { button.disabled = false; }
};
$("edit-person-form").onsubmit = async event => {
  event.preventDefault();
  if (!editing) return;
  const button = event.submitter || $("edit-person-form").querySelector('button[type="submit"]');
  button.disabled = true; message("edit-status", "Saving account details and assignments…");
  try {
    const result = await adminRequest({ action: "update", email: editing.email, display_name: $("edit-name").value,
      role: editing.role, year_group: editing.role === "student" ? $("edit-year").value : "",
      active: $("edit-active").checked, revision: Number(editing.revision),
      teacher_ids: editing.role === "student" ? selectedTeachers("edit-teacher-choices") : [] });
    await loadPeople(); $("user-editor").hidden = true; editing = null; message("people-status", result.message);
  } catch (error) { message("edit-status", error.message, true); }
  finally { button.disabled = false; }
};
$("close-editor").onclick = () => { editing = null; $("user-editor").hidden = true; };
$("people-filter").onsubmit = event => {
  event.preventDefault(); search = $("people-search").value.trim(); role = $("people-role").value; loadPeople(0);
};
$("refresh-people").onclick = () => loadPeople();
const actions = { account_registered: "Account registered", account_updated: "Details / access updated",
  invitation_sent: "Invitation accepted for sending", invitation_retry_needed: "Invitation needs retry", invitation_existing_account: "Existing verified account linked" };
async function loadAudit(nextOffset = 0) {
  message("audit-status", "Loading account activity…");
  try {
    const data = await rpc("kkf_admin_audit", { p_offset: nextOffset }); auditOffset = nextOffset;
    $("audit-list").innerHTML = data.items.length ? `<div class="table-wrap"><table class="results-table"><thead><tr><th>When</th><th>Administrator</th><th>Action</th><th>Account</th></tr></thead><tbody>${data.items.map(a => `<tr><td>${esc(date(a.created_at))}</td><td>${esc(a.actor_name)}</td><td>${esc(actions[a.action] || a.action)}${typeof a.details?.active === "boolean" ? `<span class="table-secondary">Access ${a.details.active ? "enabled" : "disabled"}</span>` : ""}</td><td>${esc(a.target_email)}</td></tr>`).join("")}</tbody></table></div>` : "<p>No administrative actions recorded yet.</p>";
    $("audit-pagination").innerHTML = `<button class="text-button" id="audit-previous" ${auditOffset === 0 ? "disabled" : ""}>← Previous</button><span>${data.total} recorded actions</span><button class="text-button" id="audit-next" ${auditOffset + 25 >= data.total ? "disabled" : ""}>Next →</button>`;
    $("audit-previous").onclick = () => loadAudit(Math.max(0, auditOffset - 25));
    $("audit-next").onclick = () => loadAudit(auditOffset + 25);
    message("audit-status", "");
  } catch (error) { message("audit-status", error.message, true); }
}
$("audit-panel").addEventListener("toggle", () => { if ($("audit-panel").open) loadAudit(0); });
$("refresh-audit").onclick = () => loadAudit(0);
await mountAuth({ adminOnly: true, onReady: async () => {
  $("admin-content").hidden = false; await loadPeople(0);
}, onSignedOut: async () => {
  people = []; teachers = []; editing = null;
  $("admin-content").hidden = true; $("user-editor").hidden = true;
  for (const id of ["people-rows", "people-overview", "new-teacher-choices", "audit-list"]) $(id).innerHTML = "";
  $("create-person-form").reset(); $("edit-person-form").reset();
} });
