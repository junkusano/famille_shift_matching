import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);

function loadUnhandledRequestAlert() {
  const code = ts.transpileModule(
    fs.readFileSync(new URL("../src/lib/agent-playbooks/unhandledRequestAlert.ts", import.meta.url), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  const overrides = {
    "@/lib/getAccessToken": { getAccessToken: async () => "token" },
    "@/lib/supabase/service": { supabaseAdmin: {} },
  };
  const module = { exports: {} };
  new Function("require", "module", "exports", code)(
    (name) => name in overrides ? overrides[name] : require(name),
    module,
    module.exports,
  );
  return module.exports;
}

function candidate(targets, channelId = "client-room") {
  return {
    request: { channel_id: channelId },
    targets,
  };
}

test("スタッフ宛の未対応アラートは発生した利用者グループだけへ送る", () => {
  const alert = loadUnhandledRequestAlert();
  const destinations = alert.resolveAlertDestinationIds(candidate([
    { userId: "staff-lw", label: "担当職員", isManager: false },
  ]));
  assert.deepEqual(destinations, ["client-room"]);
});

test("マネジャー宛の未対応アラートだけをマネジャーグループにも送る", () => {
  const alert = loadUnhandledRequestAlert();
  const destinations = alert.resolveAlertDestinationIds(candidate([
    { userId: "manager-lw", label: "担当マネジャー", isManager: true },
  ]));
  assert.deepEqual(destinations, ["client-room", "99142491"]);
});

test("スタッフとマネジャーの両方が宛先なら各グループへ一度ずつ送る", () => {
  const alert = loadUnhandledRequestAlert();
  const destinations = alert.resolveAlertDestinationIds(candidate([
    { userId: "staff-lw", label: "担当職員", isManager: false },
    { userId: "manager-lw", label: "担当マネジャー", isManager: true },
  ]));
  assert.deepEqual(destinations, ["client-room", "99142491"]);
});
