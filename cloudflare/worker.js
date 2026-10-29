import { createRemoteJWKSet, jwtVerify } from "jose";

const keySets = new Map();
const securityHeaders = {
  "Cache-Control": "private, no-store",
  "CDN-Cache-Control": "no-store",
  "Cloudflare-CDN-Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
  "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://*.supabase.co wss://*.supabase.co; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
};

function secured(response, head = false) {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(securityHeaders)) headers.set(name, value);
  return new Response(head ? null : response.body, { status: response.status, statusText: response.statusText, headers });
}

function blocked(status, message, head = false) {
  return secured(new Response(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } }), head);
}

function configuration(env) {
  const team = typeof env.CF_ACCESS_TEAM_DOMAIN === "string" ? env.CF_ACCESS_TEAM_DOMAIN.trim() : "";
  const audience = typeof env.CF_ACCESS_AUD === "string" ? env.CF_ACCESS_AUD.trim() : "";
  // Restrict the key endpoint to an administrator-configured Cloudflare team.
  // Never construct it from token claims or request headers.
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.cloudflareaccess\.com$/i.test(team)) return null;
  if (!/^[a-f0-9]{64}$/i.test(audience)) return null;
  if (!env.ASSETS || typeof env.ASSETS.fetch !== "function") return null;
  return { issuer: "https://" + team.toLowerCase(), audience };
}

function remoteKeySet(issuer) {
  if (!keySets.has(issuer)) {
    if (keySets.size >= 4) keySets.clear();
    keySets.set(issuer, createRemoteJWKSet(new URL(issuer + "/cdn-cgi/access/certs"), {
      timeoutDuration: 5000,
      cooldownDuration: 30000,
      cacheMaxAge: 600000
    }));
  }
  return keySets.get(issuer);
}

// keySetFor is injectable only by local tests. Runtime always uses Cloudflare's
// signing keys, with cryptographic signature, issuer, audience and expiry checks.
export function createPrivateWorker({ keySetFor = remoteKeySet } = {}) {
  return {
    async fetch(request, env) {
      const head = request.method === "HEAD";
      const config = configuration(env);
      if (!config) return blocked(503, "KKF Academy access setup is incomplete. Please contact your tutor.", head);

      // run_worker_first=true is mandatory: even data.js, vendor files, redirects
      // and missing paths must pass this check before ASSETS is invoked.
      const token = request.headers.get("Cf-Access-Jwt-Assertion");
      if (!token || token.length > 32768) return blocked(403, "KKF Academy sign-in is required. Please use your approved account.", head);
      try {
        const { payload } = await jwtVerify(token, keySetFor(config.issuer), {
          algorithms: ["RS256"],
          issuer: config.issuer,
          audience: config.audience,
          requiredClaims: ["exp", "iat", "sub", "email"],
          clockTolerance: 5
        });
        if (typeof payload.email !== "string" || payload.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) throw new Error("Email identity required");
        if (typeof payload.sub !== "string" || !payload.sub || typeof payload.iat !== "number" || !Number.isFinite(payload.iat) || payload.iat > Date.now() / 1000 + 5) throw new Error("Invalid user identity");
      } catch {
        // Do not reveal token details or serve cached resources on failure.
        return blocked(403, "Your KKF Academy sign-in could not be verified. Please sign in again or contact your tutor.", head);
      }

      if (request.method !== "GET" && !head) {
        return secured(new Response("Method not allowed.", { status: 405, headers: { Allow: "GET, HEAD" } }));
      }
      try {
        return secured(await env.ASSETS.fetch(request), head);
      } catch {
        return blocked(503, "The trainer is temporarily unavailable. Please try again shortly.", head);
      }
    }
  };
}

export default createPrivateWorker();
