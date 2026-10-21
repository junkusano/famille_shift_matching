import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import ts from "typescript";

function loadDeleteUser(deleteImpl) {
  const code = ts.transpileModule(
    fs.readFileSync(new URL("../src/lib/lineworks/delete-user.ts", import.meta.url), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  const axios = {
    delete: deleteImpl,
    isAxiosError(error) { return error?.isAxiosError === true; },
    get: async () => undefined,
  };
  const overrides = {
    axios: { ...axios, default: axios },
    "@/lib/getAccessToken": { getAccessToken: async () => "test-token" },
  };
  const module = { exports: {} };
  new Function("require", "module", "exports", code)(
    (name) => overrides[name],
    module,
    module.exports,
  );
  return module.exports.deleteLineWorksUser;
}

function loadActiveUsers() {
  const code = ts.transpileModule(
    fs.readFileSync(new URL("../src/lib/lineworks/active-users.ts", import.meta.url), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", code)(
    () => ({}),
    module,
    module.exports,
  );
  return module.exports.filterActiveLineWorksUsers;
}

test("退職処理のLINE WORKS削除は通常削除APIを使い、削除済みの再実行を成功扱いにする", async () => {
  const calls = [];
  const deleteUser = loadDeleteUser(async (url, options) => {
    calls.push({ url, options });
    const error = new Error("already deleted");
    error.isAxiosError = true;
    error.response = { status: 404 };
    throw error;
  });

  await assert.doesNotReject(() => deleteUser("staff/lw+id"));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://www.worksapis.com/v1.0/users/staff%2Flw%2Bid");
  assert.equal(calls[0].options.headers.Authorization, "Bearer test-token");
});

test("退職整合性一覧はLINE WORKSの削除済みユーザーを対象外にする", () => {
  const filterActiveLineWorksUsers = loadActiveUsers();

  assert.deepEqual(
    filterActiveLineWorksUsers([
      { userId: "active-user" },
      { userId: "deleted-user", isDeleted: true },
      { userId: "legacy-user", isDeleted: false },
    ]),
    [{ userId: "active-user" }, { userId: "legacy-user", isDeleted: false }],
  );
});
