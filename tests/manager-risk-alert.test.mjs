import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);

function loadManagerRiskAlert(lwUserId = "lw-kusano-id") {
  const code = ts.transpileModule(
    fs.readFileSync(new URL("../src/lib/agent-playbooks/managerRiskAlert.ts", import.meta.url), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  const query = {
    select() { return this; },
    eq() { return this; },
    limit() { return this; },
    async maybeSingle() { return { data: { lw_userid: lwUserId }, error: null }; },
  };
  const overrides = {
    openai: { default: class {} },
    zod: require("zod"),
    "@/lib/getAccessToken": { getAccessToken: async () => "token" },
    "@/lib/lineworks/sendLWBotMessage": { sendLWBotMessage: async () => undefined },
    "@/lib/openaiProfiles": { OPENAI_PROFILES: { standard: { model: "test", reasoning: "low" } } },
    "@/lib/supabase/service": { supabaseAdmin: { from: () => query } },
  };
  const module = { exports: {} };
  new Function("require", "module", "exports", code)(
    (name) => name in overrides ? overrides[name] : require(name),
    module,
    module.exports,
  );
  return module.exports;
}

test("草野代表のLINE WORKSメンションIDを職員情報から取得する", async () => {
  const managerRisk = loadManagerRiskAlert("9385af63-test");
  assert.equal(await managerRisk.getKusanoLwUserId(), "9385af63-test");
});

test("案件通知はLINE WORKS IDでメンションし、社内ユーザーIDを使わない", () => {
  const managerRisk = loadManagerRiskAlert();
  const text = managerRisk.alertText(
    {
      category: "service_quality",
      incident: "記録の未対応があります。",
      involved_people: ["担当者"],
      impact: "確認が遅れます。",
      prevention: "担当と期限を決めます。",
      confidence: "high",
      trigger_message_id: 1,
    },
    { channelId: "room", groupId: "group", groupName: "確認用グループ" },
    { id: 1, timestamp: "2026-09-15T00:00:00Z", user_id: "sender", channel_id: "room", message: "未対応" },
    "lw-kusano-id",
  );
  assert.match(text, /<m userId="lw-kusano-id">代表/);
  assert.doesNotMatch(text, /userId="junkusano"/);
});

test("草野代表の直接指示はLINE WORKS上の送信者IDで判定する", () => {
  const managerRisk = loadManagerRiskAlert();
  const log = {
    id: 1,
    timestamp: "2026-09-15T00:00:00Z",
    user_id: "lw-kusano-id",
    channel_id: "room",
    message: "この内容を確認してください",
  };
  assert.equal(managerRisk.isPotentialRiskMessage(log, "lw-kusano-id"), true);
  assert.equal(managerRisk.isPotentialRiskMessage({ ...log, user_id: "junkusano" }, "lw-kusano-id"), false);
});
