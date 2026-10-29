import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Window } from "happy-dom";
import { ACTIVITIES } from "../dist/data.js";
const tick = () => new Promise((r) => setTimeout(r, 5));
test("DOM interaction: all eight demo activities, validation, saved review and reset", async () => {
  const window = new Window({ url: "https://kkf-test.example/" });
  window.document.write(await readFile(new URL("../dist/index.html", import.meta.url), "utf8"));
  for (const name of ["document", "sessionStorage", "location"]) globalThis[name] = window[name];
  globalThis.window = window;
  window.HTMLElement.prototype.scrollIntoView = function() {
  };
  await import("../dist/app.js");
  const $ = (id) => document.getElementById(id);
  assert.equal($("workspace").hidden, false);
  assert($("account-panel").textContent.includes("Demo mode"));
  $("identify-form").dispatchEvent(new window.Event("submit", { cancelable: true }));
  await tick();
  assert($("form-error").textContent.includes("Choose"));
  for (let i = 0; i < 8; i++) {
    const q = ACTIVITIES[i];
    for (const [name, value] of [["command", q.command], ["topic", q.topic]]) {
      const el = [...document.querySelectorAll(`input[name="${name}"]`)].find((el2) => el2.value === value);
      el.checked = true;
      el.dispatchEvent(new window.Event("change"));
    }
    $("identify-form").dispatchEvent(new window.Event("submit", { cancelable: true }));
    await tick();
    assert($("answer-form"));
    $("answer-form").dispatchEvent(new window.Event("submit", { cancelable: true }));
    await tick();
    assert($("form-error").textContent.includes("Add an answer"));
    $("answer").value = 'My attempted answer: <img src=x onerror="bad">';
    $("answer").dispatchEvent(new window.Event("input"));
    if (q.command === "Calculate") {
      for (const [id, value] of [["numeric", String(q.expected)], ["unit", q.unit]]) {
        $(id).value = value;
        $(id).dispatchEvent(new window.Event("input"));
      }
    }
    $("answer-form").dispatchEvent(new window.Event("submit", { cancelable: true }));
    await tick();
    assert($("saved-answer"));
    assert.equal(document.querySelectorAll("#activity img").length, 0);
    for (const el of document.querySelectorAll('input[name="review"]')) {
      el.checked = true;
      el.dispatchEvent(new window.Event("change"));
    }
    $("finish-activity").click();
    await tick();
    assert(document.querySelector(".score").textContent.startsWith(String((i + 1) * 4)));
  }
  assert(document.querySelector(".summary-score").textContent.includes("32"));
  assert($("sync-status").textContent.includes("Demo"));
  document.querySelector("[data-reset]").click();
  assert($("confirm-reset"));
  $("confirm-reset").click();
  assert($("identify-form"));
  assert(document.querySelector(".score").textContent.startsWith("0"));
  await window.happyDOM.close();
});
