#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import nextEnv from "@next/env";
const { loadEnvConfig } = nextEnv;
import { createClient } from "@supabase/supabase-js";

const DEFAULT_FILE = "docs/famille-knowledge/key-knowledge/04_key_knowledge.json";
const argv = process.argv.slice(2);
const apply = argv.includes("--apply");
const fileFlag = argv.indexOf("--file");
const inputFile = fileFlag >= 0 ? argv[fileFlag + 1] : DEFAULT_FILE;
const validStability = new Set(["core", "slow_change", "changing"]);
const validConfidentiality = new Set(["public", "internal", "restricted"]);
const isObject = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
const text = (value) => typeof value === "string" ? value.trim() : "";
const array = (value) => Array.isArray(value) ? value : [];
const fingerprint = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

function validate(item, index) {
  const errors = [];
  if (!isObject(item)) return [{ index, key: null, message: "item must be an object" }];
  for (const field of ["key", "title", "category", "summary", "detail", "source_type", "stability", "confidentiality", "last_verified_at"]) {
    if (!text(item[field])) errors.push(field + " is required");
  }
  if (!Number.isInteger(item.concept_level) || item.concept_level < 1 || item.concept_level > 4) errors.push("concept_level must be 1..4");
  if (!Number.isInteger(item.importance) || item.importance < 1 || item.importance > 5) errors.push("importance must be 1..5");
  if (!validStability.has(item.stability)) errors.push("invalid stability");
  if (!validConfidentiality.has(item.confidentiality)) errors.push("invalid confidentiality");
  if (!array(item.source_reference).length || array(item.source_reference).some((value) => !text(value))) errors.push("source_reference must be a non-empty string array");
  if (array(item.related_keys).some((value) => !text(value))) errors.push("related_keys must be a string array");
  return errors.map((message) => ({ index, key: item.key || null, message }));
}

function normalize(item) {
  const privacy = item.confidentiality === "public" ? 0 : item.confidentiality === "restricted" ? 2 : 1;
  const evidence = text(item.evidence_status);
  const verification = evidence.startsWith("verified") || evidence.includes("visual_and_code") ? "partially_verified" : "unverified";
  const lastVerified = text(item.last_verified_at);
  const relatedKeys = array(item.related_keys);
  const sourceReferences = array(item.source_reference);
  const metadata = {
    import_kind: "key_knowledge_json",
    source_type: text(item.source_type),
    source_reference: sourceReferences,
    related_keys: relatedKeys,
    evidence_status: evidence || null,
    source_count: sourceReferences.length,
    imported_from: inputFile,
  };
  const row = {
    knowledge_key: text(item.key),
    title: text(item.title),
    summary: text(item.summary),
    content: text(item.detail),
    category: text(item.category),
    tags: [text(item.category), "key-knowledge"].filter(Boolean),
    importance: item.importance,
    concept_level: item.concept_level,
    stability: item.stability,
    confidentiality: item.confidentiality,
    source_references: sourceReferences,
    last_verified_at: lastVerified.length === 10 ? lastVerified + "T00:00:00.000Z" : lastVerified,
    privacy_level: privacy,
    publishability: item.confidentiality === "restricted" ? "never_publish" : "internal_only",
    verification_status: verification,
    generation_model: null,
    important_changes: [],
    metadata,
  };
  row.fingerprint = fingerprint(row);
  return row;
}

async function main() {
  let items;
  try {
    items = JSON.parse(await readFile(resolve(process.cwd(), inputFile), "utf8"));
  } catch (error) {
    throw new Error("入力JSONを読めません: " + (error instanceof Error ? error.message : String(error)));
  }
  if (!Array.isArray(items)) throw new Error("入力JSONは配列である必要があります。");
  const validationErrors = items.flatMap(validate);
  const keys = items.map((item) => item?.key).filter((key) => typeof key === "string");
  const duplicateKeys = keys.filter((key, index) => keys.indexOf(key) !== index);
  if (duplicateKeys.length) validationErrors.push({ index: null, key: null, message: "duplicate keys: " + [...new Set(duplicateKeys)].join(", ") });
  if (validationErrors.length) {
    console.log(JSON.stringify({ ok: false, mode: apply ? "apply" : "dry-run", validationErrors }, null, 2));
    process.exitCode = 1;
    return;
  }

  const rows = items.map(normalize);
  loadEnvConfig(process.cwd());
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("Supabase環境変数が未設定です。");
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { data: existing, error: existingError } = await db.from("knowledge_items").select("id,knowledge_key,version,metadata").in("knowledge_key", rows.map((row) => row.knowledge_key)).eq("is_current", true);
  if (existingError) throw new Error("重複確認に失敗しました: " + existingError.message);
  const byKey = new Map((existing || []).map((row) => [row.knowledge_key, row]));
  const plan = rows.map((row) => {
    const current = byKey.get(row.knowledge_key);
    const currentFingerprint = isObject(current?.metadata) ? current.metadata.key_knowledge_fingerprint : null;
    const action = !current ? "create" : currentFingerprint === row.fingerprint ? "skip" : "revise";
    return { knowledge_key: row.knowledge_key, action, current_version: current?.version || null, next_version: action === "revise" ? current.version + 1 : current?.version || 1, source_count: row.source_references.length, related_key_count: row.metadata.related_keys.length };
  });
  const summary = {
    ok: true, mode: apply ? "apply" : "dry-run", file: inputFile, validated: rows.length,
    create: plan.filter((entry) => entry.action === "create").length,
    revise: plan.filter((entry) => entry.action === "revise").length,
    skip: plan.filter((entry) => entry.action === "skip").length,
    relation_candidates: rows.reduce((total, row) => total + row.metadata.related_keys.length, 0),
    errors: [],
  };
  if (!apply) {
    console.log(JSON.stringify({ ...summary, plan }, null, 2));
    return;
  }

  const results = [];
  for (const row of rows) {
    const { data, error } = await db.rpc("import_key_knowledge_revision", { p_item: row });
    results.push(error ? { knowledge_key: row.knowledge_key, error: error.message } : { knowledge_key: row.knowledge_key, result: data?.[0] || null });
  }
  const { data: currentRows, error: currentError } = await db.from("knowledge_items").select("id,knowledge_key").in("knowledge_key", rows.map((row) => row.knowledge_key)).eq("is_current", true);
  if (currentError) results.push({ knowledge_key: null, error: currentError.message });
  const ids = new Map((currentRows || []).map((row) => [row.knowledge_key, row.id]));
  for (const row of rows) {
    const from = ids.get(row.knowledge_key);
    const relations = row.metadata.related_keys.map((key) => ({ from_knowledge_id: from, to_knowledge_id: ids.get(key), relation_type: "related", authorship: "human", manually_verified: false })).filter((entry) => entry.from_knowledge_id && entry.to_knowledge_id && entry.from_knowledge_id !== entry.to_knowledge_id);
    if (!relations.length) continue;
    const { error } = await db.from("knowledge_relations").upsert(relations, { onConflict: "from_knowledge_id,to_knowledge_id,relation_type", ignoreDuplicates: true });
    if (error) results.push({ knowledge_key: row.knowledge_key, error: error.message });
  }
  const errors = results.filter((result) => result.error);
  console.log(JSON.stringify({ ...summary, results, inserted_or_revised: results.filter((result) => result.result && result.result.action !== "skipped").length, skipped_after_apply: results.filter((result) => result.result?.action === "skipped").length, errors }, null, 2));
  if (errors.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, mode: apply ? "apply" : "dry-run", error: error instanceof Error ? error.message : String(error) }, null, 2));
  process.exitCode = 1;
});
