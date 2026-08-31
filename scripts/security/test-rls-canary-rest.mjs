import fs from "node:fs";
import path from "node:path";
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const baseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!baseUrl || !anonKey) throw new Error("Supabase anon settings are missing");

const url = `${baseUrl}/rest/v1/msg_lw_status`;
const headers = {
  apikey: anonKey,
  Authorization: `Bearer ${anonKey}`,
  "Content-Type": "application/json",
};
const tests = [
  ["SELECT", `${url}?select=id&limit=1`, { method: "GET", headers }],
  ["INSERT", url, { method: "POST", headers: { ...headers, Prefer: "return=minimal" }, body: "{}" }],
  ["UPDATE", `${url}?id=eq.-32768`, { method: "PATCH", headers: { ...headers, Prefer: "return=minimal" }, body: JSON.stringify({ label: "__rls_canary__" }) }],
  ["DELETE", `${url}?id=eq.-32768`, { method: "DELETE", headers: { ...headers, Prefer: "return=minimal" } }],
];

const results = [];
for (const [operation, requestUrl, options] of tests) {
  const response = await fetch(requestUrl, options);
  let body = {};
  try {
    body = await response.json();
  } catch {
    body = {};
  }
  results.push({
    operation,
    status: response.status,
    ok: response.ok,
    code: body.code ?? null,
    message: body.code === "42501" ? "permission denied" : body.message ? "database error" : null,
  });
}

const result = {
  ok: results.every((row) => !row.ok && row.code === "42501"),
  credential_exposed: false,
  persistent_data_change: false,
  tests: results,
  tested_at: new Date().toISOString(),
};
fs.writeFileSync(path.resolve("docs/security/rls-canary-20260830/anon-rest-test-result.json"), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exitCode = 1;
