import { client, configured, currentProfile } from "./backend.js";
import { esc } from "./utils.js";
async function mountAuth({ onReady, onSignedOut, teacherOnly = false, adminOnly = false }) {
  const panel = document.getElementById("account-panel");
  if (!configured) {
    panel.innerHTML = `<div class="account-card"><strong>${(teacherOnly || adminOnly) ? "Backend setup required" : "Demo mode \xB7 results stay in this tab"}</strong><p>${(teacherOnly || adminOnly) ? "Connect Supabase using the included setup guide to enable private reports." : "Sign-in and teacher reporting will activate after Supabase is configured. No email or result is being sent to a teacher in this demo."}</p>${(teacherOnly || adminOnly) ? '<a href="./">Back to practice demo</a>' : '<a href="./teacher.html">Teacher dashboard setup</a>'}</div>`;
    return;
  }
  let email = "";
  function form(message = "") {
    panel.innerHTML = `<section class="account-card"><h2>${adminOnly ? "Super Admin sign-in" : teacherOnly ? "Teacher sign-in" : "Your KKF Academy account"}</h2><p>Use your registered email. We will send a one-time code.</p><form id="login-form"><div class="auth-fields"><div class="field"><label for="login-email">Email address</label><input id="login-email" type="email" autocomplete="email" maxlength="254" required value="${esc(email)}"></div><button class="primary" type="submit">Send sign-in code</button></div></form><form id="verify-form" ${email ? "" : "hidden"}><div class="auth-fields"><div class="field"><label for="login-code">Code from your email</label><input id="login-code" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6,10}" minlength="6" maxlength="10" required></div><button class="primary" type="submit">Sign in</button></div></form><p id="auth-message" role="status">${esc(message)}</p><p class="privacy-note">We save your email, submitted answers, scores and submission times so your KKF Academy tutor can support your learning. Written-answer self-review is labelled separately from teacher review. Only you and authorised teachers can access your records. Contact your tutor about access or deletion.</p></section>`;
    document.getElementById("login-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const b = e.submitter;
      b.disabled = true;
      email = document.getElementById("login-email").value.trim().toLowerCase();
      try {
        const { error } = await client.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: location.origin + "/" } });
        if (error) throw error;
        form("If this email is registered, a sign-in code has been sent. Check your inbox.");
        document.getElementById("login-code").focus();
      } catch (err) {
        document.getElementById("auth-message").textContent = "Sign-in could not be sent. Check your registered email or ask your tutor. " + (err.status === 429 ? "Please wait before requesting another code." : "");
        b.disabled = false;
      }
    });
    document.getElementById("verify-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const b = e.submitter;
      b.disabled = true;
      try {
        const { error } = await client.auth.verifyOtp({ email, token: document.getElementById("login-code").value.trim(), type: "email" });
        if (error) throw error;
        await ready();
      } catch (err) {
        document.getElementById("auth-message").textContent = err.message || "The code could not be verified. Request a new code.";
        b.disabled = false;
      }
    });
  }
  async function restricted(profile, message) {
    await onSignedOut?.(false);
    panel.innerHTML = `<section class="account-card"><h2>${adminOnly ? "Super Admin access required" : "Teacher access required"}</h2><p>${esc(message)}</p><div class="account-actions"><a href="./">Open practice trainer</a>${profile.is_teacher ? '<a href="./teacher.html">Open teacher dashboard</a>' : ""}<button id="switch-account" class="text-button">Sign out and switch account</button></div><p id="restricted-status" role="status"></p></section>`;
    document.getElementById("switch-account").onclick = async event => {
      const button = event.currentTarget;
      button.disabled = true;
      const { error } = await client.auth.signOut({ scope: "local" });
      if (error) {
        document.getElementById("restricted-status").textContent = "Sign-out could not complete. Please retry.";
        button.disabled = false;
        return;
      }
      await onSignedOut?.();
      email = "";
      form("You have signed out.");
    };
  }
  async function ready() {
    const profile = await currentProfile();
    if (adminOnly && !profile.is_super_admin) return restricted(profile, "Super Admin access is required to manage accounts.");
    if (teacherOnly && !profile.is_teacher) return restricted(profile, "This account has student access. Open the practice page to continue.");
    panel.innerHTML = `<div class="account-card signed-in"><div><strong>${esc(profile.display_name || profile.email)}</strong><p>${esc(profile.email)} \xB7 ${profile.is_super_admin ? "Super Admin" : profile.is_teacher ? "Teacher" : "Student"}</p></div><div class="account-actions">${profile.is_super_admin && !adminOnly ? '<a href="./admin.html">Manage people</a>' : ""}${adminOnly ? '<a href="./teacher.html">All activity</a><a href="./">Practice trainer</a>' : ""}${profile.is_teacher && !teacherOnly ? '<a href="./teacher.html">Teacher dashboard</a>' : ""}${teacherOnly ? '<a href="./">Practice trainer</a>' : ""}<button id="sign-out" class="text-button">Sign out</button></div></div>`;
    document.getElementById("sign-out").addEventListener("click", async () => {
      const b = document.getElementById("sign-out");
      b.disabled = true;
      const { error } = await client.auth.signOut({ scope: "local" });
      if (error) {
        b.disabled = false;
        alert("Sign-out could not complete. Please retry before sharing this device.");
        return;
      }
      await onSignedOut?.();
      email = "";
      form("You have signed out.");
    });
    try {
      await onReady(profile);
    } catch (err) {
      await onSignedOut?.(false);
      panel.innerHTML = `<section class="account-card"><strong>Results could not be loaded</strong><p>${esc(err.message)}</p><button class="primary" id="reload-account">Retry connection</button><button class="text-button" id="leave-account">Sign out</button></section>`;
      document.getElementById("reload-account").onclick = () => ready().catch((err2) => form(err2.message));
      document.getElementById("leave-account").onclick = async () => {
        const { error } = await client.auth.signOut({ scope: "local" });
        if (error) {
          panel.querySelector("p").textContent = "Sign-out could not complete. Retry before sharing this device.";
          return;
        }
        await onSignedOut?.();
        form();
      };
    }
  }
  panel.innerHTML = '<div class="account-card" role="status">Checking your account\u2026</div>';
  try {
    const { data: { session }, error } = await client.auth.getSession();
    if (error) throw error;
    if (session) await ready();
    else form();
  } catch (err) {
    await onSignedOut?.(false);
    form(err.message);
  }
}
export {
  mountAuth
};
