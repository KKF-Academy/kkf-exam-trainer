// The private Cloudflare deployment must never fall back to the public demo.
if (!process.env.SUPABASE_URL?.trim() || !process.env.SUPABASE_PUBLISHABLE_KEY?.trim()) {
  throw new Error("Cloudflare build requires both SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY in build variables.");
}
await import("./build.mjs");
