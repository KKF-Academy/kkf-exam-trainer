import { ACTIVITIES, COMMANDS, UNIT_OPTIONS } from "./data.js";
const STORAGE_KEY = "kkf-exam-lab-v1";
function newSession() {
  return { version: 1, index: 0, attempts: ACTIVITIES.map(() => ({ command: "", topic: "", identified: false, draft: "", numeric: "", unit: "", submitted: false, review: [false, false], finished: false })) };
}
function current(state) {
  return ACTIVITIES[state.index];
}
function checkIdentification(state) {
  const a = state.attempts[state.index];
  const q = current(state);
  if (!a || a.identified || !Object.hasOwn(COMMANDS, a.command) || !q.topics.includes(a.topic)) return false;
  a.identified = true;
  return true;
}
function submitAnswer(state) {
  const a = state.attempts[state.index], q = current(state);
  if (!a || !a.identified || a.submitted || a.draft.trim().length === 0) return false;
  if (q.command === "Calculate" && (!a.numeric.trim() || !Number.isFinite(Number(a.numeric.trim())) || !UNIT_OPTIONS.some(([value]) => value === a.unit))) return false;
  a.submitted = true;
  return true;
}
function calculationChecks(q, a) {
  return [a.numeric.trim() !== "" && Number.isFinite(Number(a.numeric.trim())) && Math.abs(Number(a.numeric.trim()) - q.expected) < 1e-6, a.unit === q.unit];
}
function answerChecks(q, a) {
  return a.teacherReview ?? (q.command === "Calculate" ? a.autoChecks ?? calculationChecks(q, a) : a.review);
}
function finishActivity(state) {
  const a = state.attempts[state.index];
  if (!a || !a.submitted || a.finished) return false;
  a.finished = true;
  state.index++;
  return true;
}
function scoreSummary(state) {
  let command = 0, topic = 0, answer = 0, finished = 0;
  for (let i = 0; i < ACTIVITIES.length; i++) {
    const a = state.attempts[i], q = ACTIVITIES[i];
    if (a.identified) {
      command += Number(a.command === q.command);
      topic += Number(a.topic === q.topic);
    }
    if (a.finished) {
      answer += answerChecks(q, a).filter(Boolean).length;
      finished++;
    }
  }
  return { command, topic, answer, finished, total: command + topic + answer, max: ACTIVITIES.length * 4 };
}
function restoreSession(raw) {
  try {
    const s = JSON.parse(raw);
    if (s.version !== 1 || !Number.isInteger(s.index) || s.index < 0 || s.index > ACTIVITIES.length || !Array.isArray(s.attempts) || s.attempts.length !== ACTIVITIES.length) return null;
    for (let i = 0; i < s.attempts.length; i++) {
      const a = s.attempts[i], q = ACTIVITIES[i];
      if (!a || !["command", "topic", "draft", "numeric", "unit"].every((k) => typeof a[k] === "string") || !["identified", "submitted", "finished"].every((k) => typeof a[k] === "boolean") || !Array.isArray(a.review) || a.review.length !== 2 || !a.review.every((v) => typeof v === "boolean")) return null;
      if (a.command && !Object.hasOwn(COMMANDS, a.command)) return null;
      if (a.topic && !q.topics.includes(a.topic)) return null;
      if (a.identified && (!a.command || !a.topic)) return null;
      if (a.submitted && (!a.identified || a.draft.trim().length === 0)) return null;
      if (a.submitted && q.command === "Calculate" && (!a.numeric.trim() || !Number.isFinite(Number(a.numeric)) || !UNIT_OPTIONS.some(([v]) => v === a.unit))) return null;
      if (a.finished !== i < s.index || a.finished && !a.submitted) return null;
      if (i > s.index && (a.identified || a.submitted)) return null;
    }
    return s;
  } catch {
    return null;
  }
}
export {
  STORAGE_KEY,
  answerChecks,
  calculationChecks,
  checkIdentification,
  current,
  finishActivity,
  newSession,
  restoreSession,
  scoreSummary,
  submitAnswer
};
