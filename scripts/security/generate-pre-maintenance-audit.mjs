import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";

const mainRoot = "C:/Users/USER/famille_shift_matching";
const snapshotRoot = "C:/Users/USER/Downloads/supabase-pre-rls-20260824_000200";
const outputRoot = path.join(mainRoot, "docs/security/pre-maintenance-20260825/generated");

const projects = [
  { name: "famille_shift_matching", root: mainRoot, kind: "main" },
  { name: "famille-voice54", root: "C:/Users/USER/famille-voice54", kind: "voice" },
  { name: "famille-rpa", root: "C:/Users/USER/famille-rpa", kind: "rpa" },
  { name: "famille-rpa-runner", root: "C:/Users/USER/famille-rpa-runner", kind: "runner" },
  { name: "GAS", root: "G:/マイドライブ/GAS", kind: "gas" },
];

const excludedDirectories = new Set([
  ".git",
  ".next",
  "node_modules",
  "dist",
  "build",
  "coverage",
  "tmp",
  ".expo",
  "rollback-before-phase2",
  "audit-tools",
]);
const sourceExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".gs"]);
const tableOperations = ["select", "insert", "update", "delete", "upsert"];
const sensitiveColumnPattern = /(address|phone|mobile|tel|email|mail|password|secret|token|credential|salary|wage|pay|reward|bank|account|birth|medical|disability|diagnos|certificate|document|file|auth|private|fax|name|kana|kanji|postal|zip|my_number)/i;
const sensitiveTablePattern = /(user|staff|client|shift|record|document|doc|auth|token|secret|credential|salary|wage|pay|reward|bank|assessment|monitoring|plan|form_entries|fax|sms|message|talk|contract|health|disability|kaipoke)/i;

function walk(root) {
  const files = [];
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.isDirectory() && excludedDirectories.has(entry.name)) continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (sourceExtensions.has(path.extname(entry.name).toLowerCase())) files.push(full);
    }
  }
  return files;
}

function relative(project, file) {
  return path.relative(project.root, file).replaceAll("\\", "/");
}

function lineAt(text, offset) {
  return text.slice(0, offset).split("\n").length;
}

function classifyContext(project, rel, text) {
  const normalized = `/${rel.toLowerCase()}`;
  if (project.kind === "gas") return "GAS";
  if (project.kind === "voice") return normalized.includes("/supabase/functions/") ? "Edge Function" : "browser/mobile client";
  if (project.kind === "rpa") return "Chrome Extension / RPA client";
  if (project.kind === "runner") return "Runner";
  if (normalized.includes("/src/app/api/cron/")) return "Cron";
  if (normalized.includes("/src/app/api/") && normalized.includes("webhook")) return "Webhook";
  if (normalized.includes("/src/app/api/rpa/")) return "RPA API";
  if (normalized.includes("/src/app/api/")) return "Route Handler / internal API";
  if (/^[\s\r\n]*["']use client["'];?/m.test(text)) return "browser client";
  if (/^[\s\r\n]*["']use server["'];?/m.test(text)) return "Server Action";
  if (normalized.includes("/src/app/") && /\/(page|layout)\.(t|j)sx?$/.test(normalized)) return "Server Component";
  return "utility / lib";
}

function inferKeyType(project, context, text, receiver, offset) {
  const local = text.slice(Math.max(0, offset - 1200), Math.min(text.length, offset + 500));
  if (/service[_ ]?role|SUPABASE_SERVICE_ROLE_KEY|sb_secret_/i.test(local) || /admin/i.test(receiver)) return "service_role/server secret";
  if (project.kind === "runner" && /Authorization[^\n]+Bearer|RUNNER_API/i.test(text)) return "dedicated API bearer";
  if (/NEXT_PUBLIC_SUPABASE_ANON_KEY|SUPABASE_ANON_KEY|sb_publishable_/i.test(local)) {
    return /auth\.|access_token|Authorization/i.test(text) ? "anon/publishable + user JWT" : "anon/publishable";
  }
  if (context === "browser client" || context === "browser/mobile client") return "anon/publishable + user JWT (expected)";
  if (/callMyFamilleApi_|MY_FAMILLE_RPA_API_KEY|\/api\/rpa\//i.test(local)) return "internal API key";
  return "indirect/unknown";
}

function detectOperations(text, offset) {
  const tail = text.slice(offset, Math.min(text.length, offset + 900));
  const result = tableOperations.filter((op) => new RegExp(`\\.${op}\\s*\\(`).test(tail));
  return result.length ? result.join("+") : "unknown";
}

function pushMatches(rows, project, file, text, regex, objectType) {
  const rel = relative(project, file);
  const context = classifyContext(project, rel, text);
  let match;
  while ((match = regex.exec(text))) {
    const receiver = match.groups?.receiver ?? "";
    const objectName = match.groups?.object ?? "";
    rows.push({
      project: project.name,
      file: rel,
      line: lineAt(text, match.index),
      context,
      key_type: inferKeyType(project, context, text, receiver, match.index),
      object_type: objectType,
      object_name: objectName,
      operation: objectType === "TABLE_OR_VIEW" ? detectOperations(text, match.index) : objectType === "RPC" ? "execute" : "access",
      receiver,
    });
  }
}

function scanSources() {
  const usage = [];
  const secretFindings = [];
  const driveFindings = [];
  const authFindings = [];
  for (const project of projects) {
    for (const file of walk(project.root)) {
      let text;
      try {
        text = fs.readFileSync(file, "utf8");
      } catch {
        continue;
      }
      const rel = relative(project, file);
      pushMatches(usage, project, file, text, /(?<receiver>[A-Za-z_$][\w$]*)\s*\.from\s*\(\s*["'`](?<object>[^"'`]+)["'`]/g, "TABLE_OR_VIEW");
      pushMatches(usage, project, file, text, /(?<receiver>[A-Za-z_$][\w$]*)\s*\.rpc\s*\(\s*["'`](?<object>[^"'`]+)["'`]/g, "RPC");
      pushMatches(usage, project, file, text, /\.storage\.from\s*\(\s*["'`](?<object>[^"'`]+)["'`]/g, "STORAGE_BUCKET");
      pushMatches(usage, project, file, text, /\/rest\/v1\/(?<object>[A-Za-z0-9_]+)/g, "TABLE_OR_VIEW");
      pushMatches(usage, project, file, text, /\/functions\/v1\/(?<object>[A-Za-z0-9_-]+)/g, "EDGE_FUNCTION");

      const lines = text.split(/\r?\n/);
      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        if (/\.auth\.|getSession\(|getUser\(|signInWith|signOut\(/.test(line)) {
          authFindings.push({ project: project.name, file: rel, line: index + 1, context: classifyContext(project, rel, text) });
        }
        if (/GoogleApis|google\.drive|DriveApp|supportsAllDrives|sharedDrive|driveId|folderId|fileId|upload|download|copyTo|moveTo/i.test(line)) {
          driveFindings.push({ project: project.name, file: rel, line: index + 1, evidence_type: "Google Drive/file operation" });
        }
        const risky = [];
        if (/^[^/]*NEXT_PUBLIC_[A-Z0-9_]*(SERVICE|SECRET|PRIVATE|PASSWORD|TOKEN)/.test(line)) risky.push("secret-like value uses NEXT_PUBLIC_ name");
        if (/console\.(log|info|warn|error)|Logger\.log/.test(line) && /(key|secret|token|credential|authorization|apikey)/i.test(line)) risky.push("credential-like value may be logged");
        if (/[?&](key|secret|token|apikey|authorization)=/i.test(line)) risky.push("credential-like value in URL query");
        if (/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/.test(line)) risky.push("JWT-like literal");
        if (/sb_secret_[A-Za-z0-9_-]{8,}|service_role[^\n]{0,30}["'`][A-Za-z0-9_-]{20,}/i.test(line)) risky.push("service secret-like literal");
        for (const finding of risky) secretFindings.push({ project: project.name, file: rel, line: index + 1, finding });
      }
    }
  }
  return { usage, secretFindings, driveFindings, authFindings };
}

function parseAcl(acl) {
  const result = {};
  const value = String(acl ?? "").replace(/^\{/, "").replace(/\}$/, "");
  for (const item of value.split(",")) {
    const match = item.match(/^([^=]*)=([^/]*)\//);
    if (!match) continue;
    const role = match[1] || "PUBLIC";
    result[role] = {
      select: match[2].includes("r"),
      insert: match[2].includes("a"),
      update: match[2].includes("w"),
      delete: match[2].includes("d"),
      execute: match[2].includes("X"),
      raw: match[2],
    };
  }
  return result;
}

function parseColumns(schemaSql) {
  const result = new Map();
  const tableRegex = /CREATE TABLE "public"\."([^"]+)" \((.*?)\n\);/gs;
  let match;
  while ((match = tableRegex.exec(schemaSql))) {
    const columns = [];
    for (const line of match[2].split(/\r?\n/)) {
      const columnMatch = line.match(/^\s*"([^"]+)"\s+/);
      if (columnMatch) columns.push(columnMatch[1]);
    }
    result.set(match[1], columns);
  }
  return result;
}

function parsePolicies(policySql) {
  const byTable = new Map();
  for (const line of policySql.split(/\r?\n/)) {
    const match = line.match(/^CREATE POLICY (.+?) ON public\.([^ ]+) AS (\w+) FOR (\w+) TO ([^ ]+)(.*);$/);
    if (!match) continue;
    const table = match[2].replaceAll('"', "");
    const row = {
      name: match[1],
      permissive: match[3],
      command: match[4],
      roles: match[5],
      unconditional_true: /USING \(true\)|WITH CHECK \(true\)/i.test(match[6]),
      sql: line,
    };
    if (!byTable.has(table)) byTable.set(table, []);
    byTable.get(table).push(row);
  }
  return byTable;
}

function parseFunctions(schemaSql, functionRows, tableNames) {
  const output = [];
  for (const row of functionRows) {
    const escapedName = row.object_name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const marker = new RegExp(`CREATE FUNCTION \\"public\\"\\.\\"${escapedName}\\"`, "i");
    const start = schemaSql.search(marker);
    let definition = "";
    if (start >= 0) {
      const next = schemaSql.indexOf("\n\n", start);
      definition = schemaSql.slice(start, next >= 0 ? next : start + 8000);
    }
    const refs = tableNames.filter((name) => new RegExp(`(?:public\\.)?\\"?${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\"?`, "i").test(definition));
    const acl = parseAcl(row.acl);
    output.push({
      function: row.object_name,
      arguments: row.identity_arguments,
      owner: row.owner_name,
      security_definer: /SECURITY DEFINER/i.test(definition),
      public_execute: Boolean(acl.PUBLIC?.execute),
      anon_execute: Boolean(acl.anon?.execute),
      authenticated_execute: Boolean(acl.authenticated?.execute),
      service_role_execute: Boolean(acl.service_role?.execute),
      referenced_tables: refs.join("|"),
      risk: (/SECURITY DEFINER/i.test(definition) && (acl.PUBLIC?.execute || acl.anon?.execute)) ? "Critical" : (acl.PUBLIC?.execute || acl.anon?.execute) ? "High" : "Review",
    });
  }
  return output;
}

function csvEscape(value) {
  const string = value == null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
  return /[",\r\n]/.test(string) ? `"${string.replaceAll('"', '""')}"` : string;
}

function writeCsv(file, rows) {
  if (!rows.length) {
    fs.writeFileSync(file, "", "utf8");
    return;
  }
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const text = [headers.join(","), ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(","))].join("\n") + "\n";
  fs.writeFileSync(file, text, "utf8");
}

function main() {
  fs.mkdirSync(outputRoot, { recursive: true });
  const source = scanSources();
  const catalog = parse(fs.readFileSync(path.join(snapshotRoot, "catalog_snapshot_before.csv"), "utf8"), { columns: true, skip_empty_lines: true });
  const schemaSql = fs.readFileSync(path.join(snapshotRoot, "schema.sql"), "utf8");
  const policySql = fs.readFileSync(path.join(snapshotRoot, "policies_before.sql"), "utf8");
  const policies = parsePolicies(policySql);
  const columns = parseColumns(schemaSql);
  const tables = catalog.filter((row) => row.object_type === "TABLE");
  const views = catalog.filter((row) => row.object_type === "VIEW");
  const functions = catalog.filter((row) => row.object_type === "FUNCTION");
  const relationNames = new Set([...tables, ...views].map((row) => row.object_name));

  const usage = source.usage.map((row) => ({ ...row, catalog_match: relationNames.has(row.object_name) || functions.some((f) => f.object_name === row.object_name) ? "yes" : "no" }));
  const usageByObject = new Map();
  for (const row of usage) {
    if (!usageByObject.has(row.object_name)) usageByObject.set(row.object_name, []);
    usageByObject.get(row.object_name).push(row);
  }

  const tableAudit = tables.map((row) => {
    const refs = usageByObject.get(row.object_name) ?? [];
    const acl = parseAcl(row.acl);
    const browserDirect = refs.some((ref) => /browser|client/i.test(ref.context) && ref.object_type === "TABLE_OR_VIEW");
    const serverDirect = refs.some((ref) => !/browser|client/i.test(ref.context) && ref.object_type === "TABLE_OR_VIEW");
    const gasDirect = refs.some((ref) => ref.project === "GAS" && !/internal API key/.test(ref.key_type));
    const directAnon = refs.some((ref) => /anon|publishable/.test(ref.key_type) && ref.object_type === "TABLE_OR_VIEW");
    let classification = "C";
    if (browserDirect) classification = "A";
    else if (refs.length && serverDirect && !directAnon && !gasDirect) classification = "B";
    else if (refs.length) classification = "D";
    const sensitiveColumns = (columns.get(row.object_name) ?? []).filter((name) => sensitiveColumnPattern.test(name));
    const anon = acl.anon ?? {};
    const authenticated = acl.authenticated ?? {};
    const tablePolicies = policies.get(row.object_name) ?? [];
    const exposed = row.rls_enabled !== "true" && Boolean(anon.select) && (sensitiveColumns.length > 0 || sensitiveTablePattern.test(row.object_name));
    let priority = "Low";
    if (exposed) priority = "Critical";
    else if (row.rls_enabled !== "true" && (anon.insert || anon.update || anon.delete)) priority = "High";
    else if (row.rls_enabled !== "true" && (anon.select || authenticated.select || authenticated.insert || authenticated.update || authenticated.delete)) priority = "Medium";
    else if (tablePolicies.some((policy) => policy.unconditional_true && /PUBLIC|anon/.test(policy.roles))) priority = "High";
    return {
      table: row.object_name,
      classification,
      priority,
      rls_enabled: row.rls_enabled,
      rls_forced: row.rls_forced,
      anon_select: Boolean(anon.select),
      anon_insert: Boolean(anon.insert),
      anon_update: Boolean(anon.update),
      anon_delete: Boolean(anon.delete),
      authenticated_select: Boolean(authenticated.select),
      authenticated_insert: Boolean(authenticated.insert),
      authenticated_update: Boolean(authenticated.update),
      authenticated_delete: Boolean(authenticated.delete),
      service_role_privileges: acl.service_role?.raw ?? "",
      policy_count: tablePolicies.length,
      unconditional_policy_count: tablePolicies.filter((policy) => policy.unconditional_true).length,
      sensitive_columns: sensitiveColumns.join("|"),
      sensitive_exposed: exposed,
      main_usage: refs.filter((ref) => ref.project === "famille_shift_matching").length,
      gas_usage: refs.filter((ref) => ref.project === "GAS").length,
      voice_usage: refs.filter((ref) => ref.project === "famille-voice54").length,
      rpa_usage: refs.filter((ref) => ref.project === "famille-rpa").length,
      runner_usage: refs.filter((ref) => ref.project === "famille-rpa-runner").length,
      operations: [...new Set(refs.map((ref) => ref.operation))].join("|"),
      contexts: [...new Set(refs.map((ref) => `${ref.project}:${ref.context}:${ref.key_type}`))].join("|"),
    };
  });

  const viewAudit = views.map((row) => {
    const refs = usageByObject.get(row.object_name) ?? [];
    const acl = parseAcl(row.acl);
    const viewMarker = `CREATE VIEW "public"."${row.object_name}"`;
    const start = schemaSql.indexOf(viewMarker);
    const end = start >= 0 ? schemaSql.indexOf(";", start) : -1;
    const definition = start >= 0 ? schemaSql.slice(start, end >= 0 ? end + 1 : start + 5000) : "";
    const referencedTables = tables.filter((table) => new RegExp(`(?:public\\.)?\\"?${table.object_name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\"?`, "i").test(definition)).map((table) => table.object_name);
    return {
      view: row.object_name,
      owner: row.owner_name,
      security_invoker: row.security_invoker,
      security_barrier: row.security_barrier,
      anon_select: Boolean(acl.anon?.select),
      authenticated_select: Boolean(acl.authenticated?.select),
      referenced_tables: referencedTables.join("|"),
      usage_count: refs.length,
      contexts: [...new Set(refs.map((ref) => `${ref.project}:${ref.context}:${ref.key_type}`))].join("|"),
      rls_bypass_risk: row.security_invoker !== "true" && (acl.anon?.select || acl.authenticated?.select) ? "High" : row.security_invoker !== "true" ? "Review" : "Low",
    };
  });

  const functionAudit = parseFunctions(schemaSql, functions, tables.map((row) => row.object_name));
  const policyRows = [...policies.entries()].flatMap(([table, rows]) => rows.map((row) => ({ table, ...row })));
  const sensitiveExposures = tableAudit.filter((row) => row.sensitive_exposed);
  const rlsDisabledGranted = tableAudit.filter((row) => row.rls_enabled !== "true" && (row.anon_select || row.anon_insert || row.anon_update || row.anon_delete || row.authenticated_select || row.authenticated_insert || row.authenticated_update || row.authenticated_delete));

  const summary = {
    generated_at: new Date().toISOString(),
    snapshot_root: snapshotRoot,
    source_usage_rows: usage.length,
    tables: tables.length,
    tables_rls_enabled: tableAudit.filter((row) => row.rls_enabled === "true").length,
    tables_rls_disabled: tableAudit.filter((row) => row.rls_enabled !== "true").length,
    table_classification: Object.fromEntries(["A", "B", "C", "D"].map((key) => [key, tableAudit.filter((row) => row.classification === key).length])),
    views: views.length,
    views_security_invoker: viewAudit.filter((row) => row.security_invoker === "true").length,
    functions: functions.length,
    functions_security_definer: functionAudit.filter((row) => row.security_definer).length,
    functions_public_execute: functionAudit.filter((row) => row.public_execute).length,
    functions_anon_execute: functionAudit.filter((row) => row.anon_execute).length,
    policies: policyRows.length,
    policies_unconditional: policyRows.filter((row) => row.unconditional_true).length,
    sensitive_exposures: sensitiveExposures.length,
    rls_disabled_with_anon_or_authenticated_grants: rlsDisabledGranted.length,
    secret_findings: source.secretFindings.length,
    storage_references: usage.filter((row) => row.object_type === "STORAGE_BUCKET").length,
    drive_findings: source.driveFindings.length,
  };

  fs.writeFileSync(path.join(outputRoot, "summary.json"), JSON.stringify(summary, null, 2) + "\n", "utf8");
  writeCsv(path.join(outputRoot, "source_supabase_usage.csv"), usage);
  writeCsv(path.join(outputRoot, "table_rls_grant_classification.csv"), tableAudit);
  writeCsv(path.join(outputRoot, "view_audit.csv"), viewAudit);
  writeCsv(path.join(outputRoot, "function_audit.csv"), functionAudit);
  writeCsv(path.join(outputRoot, "policy_audit.csv"), policyRows.map(({ sql, ...row }) => row));
  writeCsv(path.join(outputRoot, "sensitive_columns_exposed.csv"), sensitiveExposures);
  writeCsv(path.join(outputRoot, "rls_disabled_with_grants.csv"), rlsDisabledGranted);
  writeCsv(path.join(outputRoot, "credential_findings.csv"), source.secretFindings);
  writeCsv(path.join(outputRoot, "google_drive_findings.csv"), source.driveFindings);
  writeCsv(path.join(outputRoot, "auth_usage.csv"), source.authFindings);
  console.log(JSON.stringify(summary, null, 2));
}

main();
