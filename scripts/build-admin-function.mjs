import { build } from "esbuild";
// Single-file copy for Supabase's dashboard editor. This stays outside dist/.
await build({
  entryPoints: ["supabase/functions/kkf-admin/index.ts"],
  bundle: true, format: "esm", platform: "neutral", target: "es2022",
  external: ["npm:*"], outfile: "supabase/kkf-admin-dashboard.ts"
});
