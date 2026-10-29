import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { createPrivateWorker } from "../cloudflare/worker.js";

const issuer = "https://kkf-test.cloudflareaccess.com";
const audience = "a".repeat(64);
const { privateKey, publicKey } = await generateKeyPair("RS256");
const jwk = { ...await exportJWK(publicKey), kid: "test-key", alg: "RS256", use: "sig" };
const keySet = createLocalJWKSet({ keys: [jwk] });
const worker = createPrivateWorker({ keySetFor: (url) => {
  assert.equal(url, issuer);
  return keySet;
} });

async function signed(claims = {}, options = {}) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    iss: issuer, aud: audience, sub: "student-id", email: "student@example.com",
    iat: now, exp: now + 3600, ...claims
  }).setProtectedHeader({ alg: "RS256", kid: "test-key", ...options.header })
    .sign(options.key ?? privateKey);
}

function setup(overrides = {}) {
  const calls = [];
  const env = {
    CF_ACCESS_TEAM_DOMAIN: "kkf-test.cloudflareaccess.com",
    CF_ACCESS_AUD: audience,
    ASSETS: { async fetch(request) {
      calls.push(new URL(request.url).pathname);
      return new Response("PRIVATE RESOURCE", { headers: { "Content-Type": "text/javascript", "Cache-Control": "public, max-age=3600" } });
    } },
    ...overrides
  };
  return { env, calls };
}

function request(path = "/", token, extra = {}) {
  const headers = new Headers(extra.headers);
  if (token) headers.set("Cf-Access-Jwt-Assertion", token);
  return new Request("https://trainer.example.workers.dev" + path, { ...extra, headers });
}

test("missing or malformed access configuration never delivers any asset", async () => {
  for (const override of [
    { CF_ACCESS_AUD: "" }, { CF_ACCESS_AUD: "wrong" }, { CF_ACCESS_TEAM_DOMAIN: "" },
    { CF_ACCESS_TEAM_DOMAIN: "https://kkf-test.cloudflareaccess.com" },
    { CF_ACCESS_TEAM_DOMAIN: "kkf-test.cloudflareaccess.com.attacker.example" },
    { CF_ACCESS_TEAM_DOMAIN: "127.0.0.1" }, { ASSETS: undefined }
  ]) {
    const { env, calls } = setup(override);
    const response = await worker.fetch(request("/data.js", await signed()), env);
    assert.equal(response.status, 503);
    assert.equal(calls.length, 0);
    assert.doesNotMatch(await response.text(), /PRIVATE RESOURCE/);
  }
});

test("all file types, teacher pages and unknown paths require verified Access", async () => {
  for (const path of ["/", "/index.html", "/data.js", "/engine.js", "/config.js", "/vendor/supabase.js", "/styles.css", "/teacher.html", "/teacher.js", "/missing", "/data.js?token=anything"]) {
    const { env, calls } = setup();
    const response = await worker.fetch(request(path), env);
    assert.equal(response.status, 403, path);
    assert.equal(calls.length, 0);
    assert.match(response.headers.get("Cache-Control"), /no-store/);
    assert.doesNotMatch(await response.text(), /PRIVATE RESOURCE/);
  }
});

test("a forged email header, cookie, bearer or URL token cannot replace a verified assertion", async () => {
  const valid = await signed();
  for (const req of [
    request("/", undefined, { headers: { "Cf-Access-Authenticated-User-Email": "student@example.com" } }),
    request("/", undefined, { headers: { Authorization: "Bearer " + valid } }),
    request("/", undefined, { headers: { Cookie: "CF_Authorization=" + valid } }),
    request("/?token=" + valid)
  ]) {
    const { env, calls } = setup();
    assert.equal((await worker.fetch(req, env)).status, 403);
    assert.equal(calls.length, 0);
  }
});

test("invalid signatures and invalid or incomplete identities are rejected", async () => {
  const other = await generateKeyPair("RS256");
  const tokens = [
    "not-a-jwt",
    await signed({}, { key: other.privateKey }),
    await signed({ iss: "https://other.cloudflareaccess.com" }),
    await signed({ aud: "b".repeat(64) }),
    await signed({ exp: Math.floor(Date.now() / 1000) - 60 }),
    await signed({ nbf: Math.floor(Date.now() / 1000) + 120 }),
    await signed({ iat: Math.floor(Date.now() / 1000) + 120 }),
    await signed({ exp: undefined }),
    await signed({ iat: undefined }),
    await signed({ sub: undefined }),
    await signed({ sub: "" }),
    await signed({ email: undefined }),
    await signed({ email: "" }),
    await signed({ email: "not-an-email" }),
    await signed({}, { header: { kid: "unknown-key" } })
  ];
  for (const token of tokens) {
    const { env, calls } = setup();
    const response = await worker.fetch(request("/data.js", token), env);
    assert.equal(response.status, 403);
    assert.equal(calls.length, 0);
    const body = await response.text();
    assert.doesNotMatch(body, /PRIVATE RESOURCE|student@example.com|test-key/);
  }
});

test("verified users receive assets with private response headers", async () => {
  for (const path of ["/", "/data.js", "/teacher.html", "/styles.css"]) {
    const { env, calls } = setup();
    const response = await worker.fetch(request(path, await signed()), env);
    assert.equal(response.status, 200);
    assert.deepEqual(calls, [path]);
    assert.equal(await response.text(), "PRIVATE RESOURCE");
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
    assert.equal(response.headers.get("Cloudflare-CDN-Cache-Control"), "no-store");
    assert.match(response.headers.get("Content-Security-Policy"), /frame-ancestors 'none'/);
    assert.equal(response.headers.get("Referrer-Policy"), "no-referrer");
    assert.equal(response.headers.get("Cf-Access-Jwt-Assertion"), null);
  }
});

test("HEAD and other methods cannot leak resource bodies", async () => {
  const { env, calls } = setup();
  const signedHead = await worker.fetch(request("/data.js", await signed(), { method: "HEAD" }), env);
  assert.equal(signedHead.status, 200);
  assert.equal(await signedHead.text(), "");
  assert.equal((await worker.fetch(request("/data.js", await signed(), { method: "POST" }), env)).status, 405);
  assert.deepEqual(calls, ["/data.js"]);
  const deniedHead = await worker.fetch(request("/data.js", undefined, { method: "HEAD" }), env);
  assert.equal(deniedHead.status, 403);
  assert.equal(await deniedHead.text(), "");
});

test("key or asset service failures never fall back to serving resources publicly", async () => {
  const { env, calls } = setup();
  const failing = createPrivateWorker({ keySetFor() { throw new Error("key endpoint unavailable"); } });
  assert.equal((await failing.fetch(request("/data.js", await signed()), env)).status, 403);
  assert.equal(calls.length, 0);
  env.ASSETS.fetch = async () => { throw new Error("asset binding unavailable"); };
  const response = await worker.fetch(request("/data.js", await signed()), env);
  assert.equal(response.status, 503);
  assert.doesNotMatch(await response.text(), /binding|PRIVATE RESOURCE/);
});

test("deployment checks every asset and disables version preview URLs", async () => {
  const config = JSON.parse(await readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8"));
  assert.equal(config.main, "cloudflare/worker.js");
  assert.equal(config.assets.run_worker_first, true);
  assert.equal(config.assets.binding, "ASSETS");
  assert.equal(config.preview_urls, false);
  assert.equal(config.keep_vars, true);
});

test("Cloudflare builds cannot silently deploy an unconnected demo", () => {
  const env = { ...process.env };
  delete env.SUPABASE_URL;
  delete env.SUPABASE_PUBLISHABLE_KEY;
  const child = spawnSync(process.execPath, ["scripts/build-cloudflare.mjs"], {
    cwd: new URL("../", import.meta.url), env, encoding: "utf8"
  });
  assert.notEqual(child.status, 0);
  assert.match(child.stderr, /requires both SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY/);
});
