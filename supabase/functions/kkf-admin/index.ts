import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { createAdminHandler } from "./handler.js";

function adminKey() {
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
    if (typeof keys.default === "string" && keys.default) return keys.default;
  } catch { /* Older projects provide the legacy server key below. */ }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
}
Deno.serve(createAdminHandler({ createClient, env: {
  SUPABASE_URL: Deno.env.get("SUPABASE_URL"),
  SUPABASE_SERVICE_ROLE_KEY: adminKey(),
  KKF_SITE_URL: Deno.env.get("KKF_SITE_URL") || "https://kkf-exam-trainer.vercel.app/"
} }));
