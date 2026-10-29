import { build } from "esbuild";
import { writeFile, mkdir } from "node:fs/promises";
import { CONFIG } from "../dist/config.js";
const url = (process.env.SUPABASE_URL ?? CONFIG.supabaseUrl).trim();
const key = (process.env.SUPABASE_PUBLISHABLE_KEY ?? CONFIG.supabasePublishableKey).trim();
if (Boolean(url) !== Boolean(key)) throw new Error("Set both SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY, or leave both empty for demo mode.");
if (url && (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(url) || !key.startsWith("sb_publishable_"))) throw new Error("Use the Supabase project HTTPS URL and its sb_publishable_ key. Secret and service-role keys are prohibited.");
await writeFile("dist/config.js", `// Generated public configuration. Never put a secret key in this file.
export const CONFIG = Object.freeze(${JSON.stringify({ supabaseUrl: url.replace(/\/$/, ""), supabasePublishableKey: key }, null, 2)});
`);
await mkdir("dist/vendor", { recursive: true });
await build({ stdin: { contents: "export { createClient } from '@supabase/supabase-js';", resolveDir: process.cwd() }, bundle: true, format: "esm", platform: "browser", target: "es2022", minify: true, outfile: "dist/vendor/supabase.js", legalComments: "eof" });
console.log(url ? "Built: Supabase configured." : "Built: clearly labelled demo mode (Supabase not configured).");
await import("./build-admin-function.mjs");
