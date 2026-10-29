import test from "node:test";
import assert from "node:assert/strict";
import { rowPoints, assessment, creditLabel, buildCsv, csvCell, esc } from "../dist/utils.js";
import { hydrateSession } from "../dist/backend.js";
import { ACTIVITIES } from "../dist/data.js";
import { newSession, answerChecks } from "../dist/engine.js";
const row = { question_id: "heat-transfer", command_correct: true, topic_correct: false, selected_command: "Explain", selected_topic: "air pressure", answer: "My own answer", numeric_value: "", unit: "", self_checks: [true, true], auto_checks: null, finished_at: "2026-10-20", submitted_at: "2026-10-20", teacher_checks: null };
test("teacher review replaces self-review and never changes identification points", () => {
  assert.equal(rowPoints(row), 3);
  const reviewed = { ...row, teacher_checks: [true, false] };
  assert.equal(rowPoints(reviewed), 2);
  assert.equal(assessment(reviewed), "Teacher-reviewed");
  assert.equal(creditLabel(reviewed), "Partial credit");
  assert.equal(creditLabel(null), "Not attempted");
});
test("automatic calculation checks take precedence over student self-review", () => {
  assert.equal(rowPoints({ ...row, self_checks: [true, true], auto_checks: [false, false] }), 1);
  assert.equal(assessment({ ...row, auto_checks: [false, false] }), "Automatically checked");
});
test("CSV escapes commas, quotations, newlines and formula injection", () => {
  assert.equal(csvCell('=HYPERLINK("evil")'), `"'=HYPERLINK(""evil"")"`);
  for (const v of ["+2", "-1", "@SUM(A1)", "  =2"]) assert(csvCell(v).startsWith(`"'`));
  assert.equal(csvCell("line1\nline2"), '"line1\nline2"');
  const csv = buildCsv([{ email: "student@example.com", id: "session", attempts: [row] }], ACTIVITIES);
  assert(csv.startsWith("\uFEFF"));
  assert(csv.includes("student@example.com"));
  assert(csv.includes("Not attempted"));
});
test("untrusted text is escaped for HTML", () => {
  assert.equal(esc('<img src=x onerror="bad">'), "&lt;img src=x onerror=&quot;bad&quot;&gt;");
});
test("remote attempts determine progress; only matching-session local drafts are restored", () => {
  const draft = newSession();
  draft.sessionId = "same";
  draft.attempts[1].draft = "Unsubmitted working";
  const s = hydrateSession({ id: "same" }, [row], draft);
  assert.equal(s.index, 1);
  assert.equal(s.attempts[1].draft, "Unsubmitted working");
  const other = hydrateSession({ id: "different" }, [row], draft);
  assert.equal(other.attempts[1].draft, "");
});
test("teacher review and feedback survive hydration", () => {
  const s = hydrateSession({ id: "same" }, [{ ...row, teacher_checks: [false, false], teacher_feedback: "Add a reason." }]);
  assert.deepEqual(answerChecks(ACTIVITIES[0], s.attempts[0]), [false, false]);
  assert.equal(s.attempts[0].teacherFeedback, "Add a reason.");
});
test("unsubmitted self-review ticks recover in the same session", () => {
  const draft = newSession();
  draft.sessionId = "same";
  draft.attempts[0].review = [true, false];
  const s = hydrateSession({ id: "same" }, [{ ...row, finished_at: null }], draft);
  assert.deepEqual(s.attempts[0].review, [true, false]);
});
