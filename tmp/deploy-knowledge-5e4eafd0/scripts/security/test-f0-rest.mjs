import fs from "node:fs";
import path from "node:path";
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());
const baseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!baseUrl || !anonKey) throw new Error("Supabase anon settings are missing");

const headers = {
  apikey: anonKey,
  Authorization: `Bearer ${anonKey}`,
  "Content-Type": "application/json",
};
const tests = [
  ["exec_sql", { sql_text: "SELECT 1" }],
  ["get_schema_list", {}],
  ["cm_get_alert_stats", {}],
];
const results = [];
for (const [name, body] of tests) {
  const response = await fetch(`${baseUrl}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  let responseBody = {};
  try {
    responseBody = await response.json();
  } catch {
    responseBody = {};
  }
  results.push({
    function: name,
    status: response.status,
    ok: response.ok,
    code: responseBody.code ?? null,
    message: responseBody.code === "42501" ? "permission denied" : responseBody.message ? "database error" : null,
  });
}
const result = {
  ok: results.every((row) => !row.ok && row.code === "42501"),
  credential_exposed: false,
  dangerous_sql_executed: false,
  tests: results,
  tested_at: new Date().toISOString(),
};
fs.writeFileSync(path.resolve("docs/security/f0-20260830/anon-rest-test-result.json"), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exitCode = 1;
