import { writeFile } from "node:fs/promises";
import { ACTIVITIES } from "../dist/data.js";
const str = (v) => "'" + String(v).replaceAll("'", "''") + "'";
const values = ACTIVITIES.map((q, i) => `('kkf-v1',${str(q.id)},${i + 1},${str(q.subject)},${str(q.command)},${str(q.topic)},${str(JSON.stringify(q.topics))}::jsonb,${str(q.question)},${str(q.model)},${str(JSON.stringify(q.criteria || []))}::jsonb,${q.expected ?? "null"},${q.unit ? str(q.unit) : "null"})`).join(",\n");
await writeFile("supabase/02-questions.sql", `-- Immutable question catalogue for kkf-v1. Run after 01-schema.sql.
-- For a new quiz, use a new version and an explicit migration.
insert into kkf_private.questions(quiz_version,question_id,position,subject,command,topic,topic_options,question,model,criteria,expected,unit) values
${values}
on conflict(quiz_version,question_id) do nothing;
`);
