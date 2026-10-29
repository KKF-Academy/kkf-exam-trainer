const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
function effectiveChecks(a) {
  return a.teacher_checks ?? a.auto_checks ?? a.self_checks ?? [false, false];
}
function rowPoints(a) {
  return Number(a.command_correct) + Number(a.topic_correct) + (a.finished_at ? effectiveChecks(a).filter(Boolean).length : 0);
}
function reportTotals(session) {
  const attempts = session.attempts || [];
  return { points: attempts.reduce((n, a) => n + rowPoints(a), 0), finished: attempts.filter((a) => a.finished_at).length, pending: attempts.filter((a) => a.finished_at && !a.auto_checks && !a.teacher_checks).length };
}
function assessment(a) {
  return a.teacher_checks ? "Teacher-reviewed" : a.auto_checks ? "Automatically checked" : a.finished_at ? "Self-reviewed" : "In progress";
}
function creditLabel(a) {
  if (!a) return "Not attempted";
  if (!a.finished_at) return "In progress";
  const n = rowPoints(a);
  return n === 4 ? "Full credit" : n === 0 ? "No credit" : "Partial credit";
}
function reviewHistoryHtml(history = []) {
  if (!history.length) return "";
  return `<details class="review-history"><summary>Teacher review history (${history.length})</summary><ol>${history.map(h => `<li><strong>${esc(h.reviewer_name)}</strong><span class="table-secondary">${esc(new Date(h.reviewed_at).toLocaleString())} · ${h.checks.filter(Boolean).length} / 2 answer points</span><p class="saved-answer">${esc(h.feedback || "No written feedback.")}</p></li>`).join("")}</ol><p class="review-help">The latest saved review determines the written-answer points. Earlier reviews remain in the history.</p></details>`;
}
function csvCell(value) {
  let text = String(value ?? "");
  if (/^[\s]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
function buildCsv(sessions, questions) {
  const rows = [["Email", "Display name", "Session ID", "Started (UTC)", "Completed (UTC)", "Score /32", "Question ID", "Question", "Command selected", "Command correct", "Topic selected", "Topic correct", "Student answer", "Number", "Unit", "Question points /4", "Status", "Assessment", "Self checks", "Teacher checks", "Teacher feedback"]];
  for (const s of sessions) {
    const t = reportTotals(s);
    for (const q of questions) {
      const a = (s.attempts || []).find((v) => v.question_id === q.id);
      rows.push([s.email, s.display_name, s.id, s.started_at, s.completed_at, t.points, q.id, q.question, a?.selected_command, a ? a.command_correct : "", a?.selected_topic, a ? a.topic_correct : "", a?.answer, a?.numeric_value, a?.unit, a ? rowPoints(a) : "", creditLabel(a), a ? assessment(a) : "", a?.self_checks?.join(";"), a?.teacher_checks?.join(";"), a?.teacher_feedback]);
    }
  }
  return "\uFEFF" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}
export {
  reviewHistoryHtml,
  assessment,
  buildCsv,
  creditLabel,
  csvCell,
  effectiveChecks,
  esc,
  reportTotals,
  rowPoints
};
