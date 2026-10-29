import { reviewHistoryHtml } from "./utils.js";
import { configured, ensureSession, loadLatest, saveIdentification, saveAnswer, saveReview } from "./backend.js";
import { mountAuth } from "./auth-ui.js";
import { esc } from "./utils.js";
import { ACTIVITIES, COMMANDS, UNIT_OPTIONS } from "./data.js";
import { STORAGE_KEY, newSession, checkIdentification, submitAnswer, finishActivity, scoreSummary, restoreSession, answerChecks, calculationChecks } from "./engine.js";
const $ = (id) => document.getElementById(id);
let storageAvailable = true, resetOpen = false, state = newSession(), profile = null, storageKey = STORAGE_KEY + "-demo";
function readDraft() {
  try {
    return restoreSession(sessionStorage.getItem(storageKey));
  } catch {
    storageAvailable = false;
    return null;
  }
}
function persist() {
  try {
    sessionStorage.setItem(storageKey, JSON.stringify(state));
  } catch {
    storageAvailable = false;
  }
  updateStorageNote();
}
function updateStorageNote() {
  $("storage-note").textContent = configured ? "Submitted selections and answers are saved to your KKF Academy account. Unsubmitted drafts stay in this tab." : storageAvailable ? "Demo mode: work stays in this browser tab. No teacher receives these results." : "Demo mode: this browser cannot save the session. Keep this page open.";
}
function syncStatus(message, error = false) {
  $("sync-status").textContent = message;
  $("sync-status").classList.toggle("sync-error", error);
}
async function saving(action) {
  document.querySelectorAll("#activity button,#activity input,#activity textarea,#activity select").forEach((el) => el.disabled = true);
  syncStatus(configured ? "Saving to your account\u2026" : "Saving demo progress in this tab\u2026");
  try {
    await action();
    syncStatus(configured ? "Saved to your account." : "Demo progress saved in this tab only.");
  } catch (err) {
    render();
    syncStatus("Not saved: " + err.message + " Your current attempt is still here. Retry when connected.", true);
  }
}
function announce(message) {
  $("announcer").textContent = message;
}
function focusActivity() {
  $("activity").focus();
  $("activity").scrollIntoView({ behavior: "instant", block: "start" });
}
const arrow = '<span class="arrow" aria-hidden="true">\u2192</span>';
function highlightedQuestion(q, show) {
  if (!show) return esc(q.question);
  return esc(q.question).replace(esc(q.command), `<mark class="command-mark">${esc(q.command)}</mark>`).replace(esc(q.topic), `<mark class="topic-mark">${esc(q.topic)}</mark>`);
}
function optionGroup(name, label, number, values, selected) {
  return `<fieldset class="choice-group"><legend><span class="small-number" aria-hidden="true">${number}</span>${label}</legend><div class="choices">${values.map((v) => `<label class="choice"><input type="radio" name="${name}" value="${esc(v)}" ${v === selected ? "checked" : ""}><span>${esc(v)}</span></label>`).join("")}</div></fieldset>`;
}
function renderSession() {
  const s = scoreSummary(state);
  $("session-panel").innerHTML = `<p class="session-eyebrow">YOUR SESSION</p><p class="score">${s.total}<small>/ ${s.max}</small></p><p class="score-caption">Practice points \xB7 review source labelled</p><div class="session-progress-label"><span>Activities completed</span><strong>${s.finished} / ${ACTIVITIES.length}</strong></div><div class="progress-bar" role="progressbar" aria-label="Activities completed" aria-valuemin="0" aria-valuemax="8" aria-valuenow="${s.finished}"><span style="width:${s.finished / 8 * 100}%"></span></div><div class="activity-dots" aria-hidden="true">${ACTIVITIES.map((q, i) => `<span class="activity-dot ${i < s.finished ? "complete" : i === state.index ? "current" : ""}">${i < s.finished ? "\u2713" : i + 1}</span>`).join("")}</div><div class="score-breakdown"><div><span>Command words</span><strong>${s.command} / 8</strong></div><div><span>Topic words</span><strong>${s.topic} / 8</strong></div><div><span>Answer practice</span><strong>${s.answer} / 16</strong></div></div><details class="score-how"><summary>How your score works</summary><p>Each activity: 1 point for the command, 1 for the topic, and up to 2 for the answer. First identification choices count. Written answers use your self-review; calculation results and units are checked automatically. Working is shown for you to review.</p></details><button class="text-button restart" data-reset>Start a new session</button>`;
}
function resetPrompt() {
  return resetOpen ? `<section class="reset-confirm" role="group" aria-label="Start a new session" style="background:#fff3d4;border:1px solid #d7b561;border-radius:12px;padding:18px;margin-bottom:16px"><strong>Start again from activity 1?</strong><p style="font-size:12px;margin:6px 0 12px">${configured ? "Previously saved sessions remain in the teacher dashboard. This begins a new practice session." : "This clears the answers and score in this tab."}</p><button class="primary" id="confirm-reset">Start again</button> <button class="text-button" id="cancel-reset">Keep this session</button></section>` : "";
}
function renderActivity() {
  if (state.index === ACTIVITIES.length) return renderSummary();
  const q = ACTIVITIES[state.index], a = state.attempts[state.index], c = COMMANDS[q.command];
  const step = a.submitted ? 3 : a.identified ? 2 : 1;
  let content = `<div class="step-track" aria-label="Step ${step} of 3">${["Identify", "Answer", "Review"].map((label, i) => `<span class="${step === i + 1 ? "active" : step > i + 1 ? "done" : ""}" ${step === i + 1 ? 'aria-current="step"' : ""}><b>${step > i + 1 ? "\u2713" : i + 1}</b>${label}</span>`).join("")}</div><p class="section-label">THE QUESTION</p><h2 class="question">${highlightedQuestion(q, a.identified)}</h2>`;
  if (!a.identified) {
    content += `<p class="task-note">Before you answer, pick the instruction and what it is about.</p><form id="identify-form">${optionGroup("command", "Which is the command word?", "01", Object.keys(COMMANDS), a.command)}${optionGroup("topic", "Which is the topic word or phrase?", "02", q.topics, a.topic)}<p class="error" id="form-error" role="alert"></p><div class="action-row"><button class="primary" type="submit">Check my choices ${arrow}</button><span class="action-note">2 points available<br>Your first choices count.</span></div></form>`;
  } else {
    const commandCorrect = a.command === q.command, topicCorrect = a.topic === q.topic;
    content += `<div class="identity-results"><span class="result-chip ${commandCorrect ? "" : "missed"}">${commandCorrect ? "\u2713" : "\u2197"} Command ${commandCorrect ? "+1" : "0 / 1"}</span><span class="result-chip ${topicCorrect ? "" : "missed"}">${topicCorrect ? "\u2713" : "\u2197"} Topic ${topicCorrect ? "+1" : "0 / 1"}</span></div>${!commandCorrect || !topicCorrect ? `<p class="identity-explanation">${!commandCorrect ? `You chose <strong>${esc(a.command)}</strong>. The instruction is <strong>${q.command}</strong>. ` : ""}${!topicCorrect ? `You chose <strong>${esc(a.topic)}</strong>. The question is about <strong>${esc(q.topic)}</strong>.` : ""}</p>` : ""}`;
    if (!a.submitted) {
      content += `<section class="guidance" aria-label="What the command requires"><h2>${q.command}: ${c.short.toLowerCase()}</h2><p>${c.detail}</p><p class="starter">${c.prompt}</p></section><form id="answer-form"><label class="answer-label" for="answer">${q.command === "Calculate" ? "Show your working" : "Your answer"}</label><textarea id="answer" name="answer" maxlength="1600" placeholder="${esc(q.placeholder)}" aria-describedby="answer-note">${esc(a.draft)}</textarea><p class="input-note" id="answer-note">${q.command === "Calculate" ? "Show the relationship and substitution. The numerical result and unit earn the answer points." : "Try it in your own words. You will compare your answer with a model next."}</p>${q.command === "Calculate" ? `<div class="calculation-fields"><div class="field"><label for="numeric">Numerical result</label><input id="numeric" name="numeric" type="text" inputmode="decimal" maxlength="30" value="${esc(a.numeric)}" placeholder="e.g. 2.5" autocomplete="off"></div><div class="field"><label for="unit">Unit</label><select id="unit" name="unit"><option value="">Choose a unit</option>${UNIT_OPTIONS.map(([v, label]) => `<option value="${v}" ${v === a.unit ? "selected" : ""}>${label}</option>`).join("")}</select></div></div>` : ""}<details class="hint"><summary>Need a small hint?</summary><p>${q.hint}</p></details><p class="error" id="form-error" role="alert"></p><div class="action-row"><button class="primary" type="submit">${q.command === "Calculate" ? "Check my answer" : "Review my answer"} ${arrow}</button><span class="action-note">${q.command === "Calculate" ? "Number & unit checked automatically" : "Written answer points use your self-review"}</span></div></form>`;
    } else {
      content += `<label class="answer-label" for="saved-answer">Your attempt</label><textarea readonly id="saved-answer" aria-label="Your submitted answer">${esc(a.draft)}</textarea>${q.command === "Calculate" ? `<p class="input-note">Your result: <strong>${esc(a.numeric)} ${esc(UNIT_OPTIONS.find(([v]) => v === a.unit)?.[1] || "")}</strong></p>` : ""}<section class="model-answer"><h2>A model answer</h2><p>${esc(q.model)}</p></section><div class="trap"><b>Watch out</b><span>${q.trap}</span></div>`;
      if (q.command === "Calculate") {
        const checks = calculationChecks(q, a);
        content += `<h3 class="review-title">Your result check</h3><p class="review-help">The number and unit are checked automatically. Compare your method with the model above; working is not automatically marked.</p><div class="calc-result ${checks[0] ? "" : "missed"}"><span aria-hidden="true">${checks[0] ? "\u2713" : "\u2197"}</span><div><strong>${checks[0] ? "Correct numerical result \xB7 +1 point" : `Numerical result \xB7 0 points`}</strong>${checks[0] ? "" : `<br>The result should be ${q.expected}. Follow the substitution in the model.`}</div></div><div class="calc-result ${checks[1] ? "" : "missed"}"><span aria-hidden="true">${checks[1] ? "\u2713" : "\u2197"}</span><div><strong>${checks[1] ? "Correct unit \xB7 +1 point" : "Unit \xB7 0 points"}</strong>${checks[1] ? "" : `<br>The expected unit is ${q.unitLabel}.`}</div></div>`;
      } else {
        content += `<h3 class="review-title">Check your answer honestly</h3><p class="review-help">Tick only what was already in your attempt. Equivalent correct wording counts. Each tick adds 1 self-reviewed practice point when you continue.</p>${q.criteria.map((criterion, i) => `<label class="review-check"><input type="checkbox" name="review" data-index="${i}" ${a.review[i] ? "checked" : ""}><span>${esc(criterion)}</span></label>`).join("")}`;
      }
      content += `<div class="action-row"><button class="primary" id="finish-activity">${state.index === ACTIVITIES.length - 1 ? "Save & see my session" : "Save & next activity"} ${arrow}</button><span class="action-note">Answer points are saved when you continue.</span></div>`;
    }
  }
  $("activity").innerHTML = resetPrompt() + `<article class="practice-card"><div class="card-top"><span class="activity-label">ACTIVITY ${String(state.index + 1).padStart(2, "0")} <span style="font-weight:normal">/ 08</span></span><span class="subject">${q.subject}</span></div><div class="card-body">${content}<button class="text-button mobile-reset" data-reset>Start a new session</button></div></article>`;
}
function renderSummary() {
  const s = scoreSummary(state);
  const rows = Object.keys(COMMANDS).map((command) => {
    const indices = ACTIVITIES.map((q, i) => q.command === command ? i : -1).filter((i) => i >= 0);
    const total = indices.reduce((n, i) => n + Number(state.attempts[i].command === command) + Number(state.attempts[i].topic === ACTIVITIES[i].topic) + answerChecks(ACTIVITIES[i], state.attempts[i]).filter(Boolean).length, 0);
    return { command, total };
  });
  const weak = rows.reduce((low, row) => row.total < low.total ? row : low, rows[0]);
  $("activity").innerHTML = resetPrompt() + `<article class="practice-card"><div class="summary-header"><p class="section-label">SESSION COMPLETE</p><h2>You read with purpose.<br>Keep building the habit.</h2><div class="summary-score">${s.total}<small>/ ${s.max}</small></div><p>Practice points from 8 activities. Written answers use labelled self-review or teacher review. This is a practice score.</p></div><div class="card-body"><h3 class="review-title">Your command-word practice</h3><div class="summary-grid">${rows.map((r) => `<div class="summary-metric"><strong>${r.total} / 8</strong><span>${r.command}</span></div>`).join("")}</div><div class="next-focus"><strong>${weak.total === 8 ? "YOUR NEXT STEP" : "A USEFUL NEXT FOCUS"}</strong>${weak.total === 8 ? "Apply the same three steps to a fresh past-paper question: command, topic, answer." : `Practise ${weak.command.toLowerCase()} next: ${COMMANDS[weak.command].detail}`}</div><h3 class="review-title">Revisit your activities</h3><p class="review-help">Open an activity to compare your attempt with the model answer.</p><div class="review-list">${ACTIVITIES.map((q, i) => {
    const a = state.attempts[i], checks = answerChecks(q, a), points = Number(a.command === q.command) + Number(a.topic === q.topic) + checks.filter(Boolean).length;
    return `<details><summary><span>${i + 1}. ${q.command} \xB7 ${q.subject}</span><strong>${points} / 4</strong></summary><p><strong>${esc(q.question)}</strong></p><p>Command: ${a.command === q.command ? "correct" : `${esc(a.command)} \u2192 ${q.command}`} \xB7 Topic: ${a.topic === q.topic ? "correct" : `${esc(a.topic)} \u2192 ${esc(q.topic)}`}</p><p><strong>Your attempt</strong></p><p class="saved-answer">${esc(a.draft)}${q.command === "Calculate" ? `
Result: ${esc(a.numeric)} ${esc(UNIT_OPTIONS.find(([v]) => v === a.unit)?.[1] || "")}` : ""}</p><p><strong>Model:</strong> ${esc(q.model)}</p>${a.teacherFeedback ? `<p><strong>Teacher feedback:</strong> ${esc(a.teacherFeedback)}</p>` : ""}${reviewHistoryHtml(a.teacherHistory || [])}<p>Answer practice: ${checks.filter(Boolean).length} / 2 (${a.teacherReview ? "teacher-reviewed" : q.command === "Calculate" ? "number and unit checked automatically" : "self-reviewed"}).</p></details>`;
  }).join("")}</div><div class="action-row"><button class="primary" data-reset>Start a fresh session ${arrow}</button><span class="action-note">New session, same eight activities.<br>Try writing without the hint.</span></div></div></article>`;
}
function bind() {
  document.querySelectorAll("[data-reset]").forEach((b) => b.addEventListener("click", () => {
    resetOpen = true;
    render();
    $("confirm-reset").focus();
  }));
  $("cancel-reset")?.addEventListener("click", () => {
    resetOpen = false;
    render();
    focusActivity();
  });
  $("confirm-reset")?.addEventListener("click", () => {
    state = newSession();
    resetOpen = false;
    persist();
    render();
    syncStatus(configured ? "A new session will be saved when you check your first choices." : "Demo session restarted.");
    announce("New session started. Activity 1 of 8.");
    focusActivity();
  });
  if (state.index === ACTIVITIES.length) return;
  const a = state.attempts[state.index];
  document.querySelectorAll('input[name="command"],input[name="topic"]').forEach((el) => el.addEventListener("change", () => {
    if (!a.identified) {
      a[el.name] = el.value;
      persist();
    }
  }));
  $("identify-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const candidate = structuredClone(state);
    if (!checkIdentification(candidate)) {
      $("form-error").textContent = "Choose a command word and a topic before checking.";
      return;
    }
    await saving(async () => {
      if (configured) {
        await ensureSession(state, persist);
        candidate.sessionId = state.sessionId;
        await saveIdentification(candidate);
      }
      state = candidate;
      persist();
      render();
      announce("Choices checked. Read the command guidance, then write your answer.");
      focusActivity();
    });
  });
  for (const [id, key] of [["answer", "draft"], ["numeric", "numeric"], ["unit", "unit"]]) $(id)?.addEventListener("input", (e) => {
    if (!a.submitted) {
      a[key] = e.target.value;
      persist();
    }
  });
  $("answer-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const candidate = structuredClone(state);
    if (!submitAnswer(candidate)) {
      $("form-error").textContent = !a.draft.trim() ? "Add an answer or some working before viewing the model." : "Enter a numerical result and choose a unit. Use \u201CNo unit\u201D when appropriate.";
      return;
    }
    await saving(async () => {
      if (configured) await saveAnswer(candidate);
      state = candidate;
      persist();
      render();
      announce("Your attempt is saved. Review the model and feedback.");
      focusActivity();
    });
  });
  document.querySelectorAll('input[name="review"]').forEach((el) => el.addEventListener("change", () => {
    a.review[Number(el.dataset.index)] = el.checked;
    persist();
  }));
  $("finish-activity")?.addEventListener("click", async () => {
    const candidate = structuredClone(state), index = state.index;
    if (!finishActivity(candidate)) return;
    await saving(async () => {
      if (configured) await saveReview(candidate, index);
      state = candidate;
      persist();
      render();
      announce(state.index === ACTIVITIES.length ? "Session complete. Your score and review are ready." : `Activity ${state.index + 1} of 8. Your points have been saved.`);
      focusActivity();
    });
  });
}
function render() {
  renderSession();
  renderActivity();
  bind();
  updateStorageNote();
}
$("guide-body").innerHTML = Object.entries(COMMANDS).map(([word, c]) => `<div class="guide-item"><strong>${word} \xB7 ${c.short}</strong><p>${c.detail}</p></div>`).join("");
async function signedOut(clearDraft = true) {
  if (clearDraft && storageKey !== STORAGE_KEY + "-demo") {
    try {
      sessionStorage.removeItem(storageKey);
    } catch {
    }
  }
  profile = null;
  state = newSession();
  $("workspace").hidden = true;
  syncStatus("");
}
await mountAuth({ onReady: async (user) => {
  profile = user;
  storageKey = STORAGE_KEY + "-" + user.id;
  state = await loadLatest(user, readDraft());
  render();
  persist();
  $("workspace").hidden = false;
  syncStatus("Account connected. Submitted activities are saved to your tutor\u2019s dashboard.");
}, onSignedOut: signedOut });
if (!configured) {
  state = readDraft() || newSession();
  render();
  persist();
  $("workspace").hidden = false;
}
