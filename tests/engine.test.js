import test from "node:test";
import assert from "node:assert/strict";
import { ACTIVITIES, COMMANDS } from "../dist/data.js";
import { newSession, checkIdentification, submitAnswer, finishActivity, scoreSummary, restoreSession, calculationChecks } from "../dist/engine.js";
function identify(s, correct = true) {
  const q = ACTIVITIES[s.index], a = s.attempts[s.index];
  a.command = correct ? q.command : Object.keys(COMMANDS).find((c) => c !== q.command);
  a.topic = correct ? q.topic : q.topics.find((t) => t !== q.topic);
  assert.equal(checkIdentification(s), true);
  return a;
}
function answer(s, correct = true) {
  const a = s.attempts[s.index], q = ACTIVITIES[s.index];
  a.draft = "My own attempted answer and working.";
  if (q.command === "Calculate") {
    a.numeric = String(correct ? q.expected : q.expected + 1);
    a.unit = correct ? q.unit : "kg";
  }
  assert.equal(submitAnswer(s), true);
  a.review = [correct, correct];
  return a;
}
test("content covers each command twice, with four Maths and four Science activities", () => {
  assert.equal(ACTIVITIES.length, 8);
  assert.equal(ACTIVITIES.filter((q) => q.subject === "Maths").length, 4);
  assert.equal(new Set(ACTIVITIES.map((q) => q.id)).size, 8);
  for (const command of Object.keys(COMMANDS)) assert.equal(ACTIVITIES.filter((q) => q.command === command).length, 2);
  for (const q of ACTIVITIES) {
    assert(q.question.includes(q.command));
    assert(q.question.includes(q.topic));
    assert(q.topics.includes(q.topic));
    if (q.command !== "Calculate") assert.equal(q.criteria.length, 2);
  }
});
test("requires identification and an answer before moving on", () => {
  const s = newSession();
  assert.equal(checkIdentification(s), false);
  assert.equal(submitAnswer(s), false);
  assert.equal(finishActivity(s), false);
  identify(s);
  s.attempts[0].draft = "   ";
  assert.equal(submitAnswer(s), false);
  assert.equal(scoreSummary(s).total, 2);
});
test("correct complete session scores 32; finishing twice cannot bank points twice", () => {
  const s = newSession();
  for (let i = 0; i < 8; i++) {
    identify(s);
    answer(s);
    assert.equal(checkIdentification(s), false);
    assert.equal(submitAnswer(s), false);
    assert.equal(finishActivity(s), true);
    assert.equal(finishActivity(s), false);
  }
  assert.deepEqual(scoreSummary(s), { command: 8, topic: 8, answer: 16, finished: 8, total: 32, max: 32 });
  assert.equal(s.index, 8);
});
test("incorrect identification earns no points and still permits guided answer practice", () => {
  const s = newSession();
  identify(s, false);
  answer(s, true);
  finishActivity(s);
  assert.equal(scoreSummary(s).command, 0);
  assert.equal(scoreSummary(s).topic, 0);
  assert.equal(scoreSummary(s).answer, 2);
});
test("unchecked written self-review can be saved honestly with zero answer points", () => {
  const s = newSession();
  identify(s);
  answer(s, false);
  assert.equal(finishActivity(s), true);
  assert.equal(scoreSummary(s).total, 2);
});
test("calculation checks independently validate the number and unit", () => {
  const gradient = ACTIVITIES[1], accel = ACTIVITIES[5];
  assert.equal(gradient.expected, (11 - 3) / (5 - 1));
  assert.equal(accel.expected, 12 / 4);
  assert.deepEqual(calculationChecks(gradient, { numeric: "2.00", unit: "none" }), [true, true]);
  assert.deepEqual(calculationChecks(accel, { numeric: "3", unit: "m/s" }), [true, false]);
  assert.deepEqual(calculationChecks(accel, { numeric: "4", unit: "m/s2" }), [false, true]);
  for (const numeric of ["", " ", "abc", "Infinity", "NaN"]) assert.equal(calculationChecks(accel, { numeric, unit: "m/s2" })[0], false);
});
test("calculation submission rejects a missing number or unit", () => {
  const s = newSession();
  identify(s);
  answer(s);
  finishActivity(s);
  identify(s);
  const a = s.attempts[1];
  a.draft = "(11-3)/(5-1)=2";
  a.numeric = "2";
  assert.equal(submitAnswer(s), false);
  a.unit = "none";
  assert.equal(submitAnswer(s), true);
});
test("draft, review and completed session recover correctly", () => {
  const s = newSession();
  s.attempts[0].command = "Explain";
  s.attempts[0].draft = "A draft";
  assert.deepEqual(restoreSession(JSON.stringify(s)), s);
  identify(s);
  answer(s);
  assert.deepEqual(restoreSession(JSON.stringify(s)), s);
  finishActivity(s);
  assert.deepEqual(restoreSession(JSON.stringify(s)), s);
  while (s.index < 8) {
    identify(s);
    answer(s);
    finishActivity(s);
  }
  assert.deepEqual(restoreSession(JSON.stringify(s)), s);
});
test("corrupt or inconsistent saved sessions are discarded", () => {
  for (const raw of ["oops", "null", "{}", "[]", '{"version":2}']) assert.equal(restoreSession(raw), null);
  const s = newSession();
  s.index = 1;
  assert.equal(restoreSession(JSON.stringify(s)), null);
  const t = newSession();
  t.attempts[0].submitted = true;
  assert.equal(restoreSession(JSON.stringify(t)), null);
});
test("starting again clears the score and previous answers", () => {
  const s = newSession();
  identify(s);
  answer(s);
  finishActivity(s);
  const fresh = newSession();
  assert.equal(scoreSummary(fresh).total, 0);
  assert.equal(fresh.attempts[0].draft, "");
  assert.equal(fresh.index, 0);
});
