import fs from "node:fs";

const snapshot = JSON.parse(fs.readFileSync("docs/security/f0-20260830/security-definer-after.json", "utf8"));
const functions = [];
for (const fn of snapshot.functions.filter((row) => !row.search_path_fixed)) {
  const candidates = [];
  const relationPattern = /\b(?:FROM|JOIN|UPDATE|INSERT\s+INTO|DELETE\s+FROM)\s+(["A-Za-z_]["A-Za-z0-9_$]*)/gi;
  let match;
  while ((match = relationPattern.exec(fn.definition))) {
    const name = match[1].replaceAll('"', "");
    if (!name.includes(".") && !["select", "values"].includes(name.toLowerCase())) candidates.push(name);
  }
  functions.push({
    signature: `${fn.name}(${fn.identity_args})`,
    unqualified_relation_candidates: [...new Set(candidates)],
  });
}
const result = {
  generated_at: new Date().toISOString(),
  heuristic: true,
  search_path_unfixed: functions.length,
  with_unqualified_relation_candidates: functions.filter((row) => row.unqualified_relation_candidates.length > 0).length,
  functions,
};
fs.writeFileSync("docs/security/f0-20260830/search-path-unqualified-candidates.json", JSON.stringify(result, null, 2));
console.log(JSON.stringify({
  search_path_unfixed: result.search_path_unfixed,
  with_unqualified_relation_candidates: result.with_unqualified_relation_candidates,
  functions: functions.filter((row) => row.unqualified_relation_candidates.length > 0).map((row) => row.signature),
}, null, 2));
