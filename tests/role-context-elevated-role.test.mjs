import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/context/RoleContext.tsx", import.meta.url), "utf8");

test("RoleContext は管理者・マネージャーの権限値を正規化して保持する", () => {
  assert.match(source, /select\('user_id, system_role, role/);
  assert.match(source, /system_admin/);
  assert.match(source, /super_admin/);
  assert.match(source, /setRole\(normalizedRole/);
});
