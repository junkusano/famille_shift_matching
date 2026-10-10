const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const compiled = ts.transpileModule(fs.readFileSync('src/lib/monitoring/signed-plan.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const api = {};
vm.runInNewContext(compiled, {
  exports: api,
  require: (name) => {
    if (name === 'server-only') return {};
    if (name.includes('cs-docs-reprocess')) return {};
    if (name.includes('supabase/service')) return {};
    if (name === './core') return { cleanMonitoringGoalText: (value) => value.replace(/[■□](?:身体|家事).*$/, '').trimEnd() };
    throw new Error(`Unexpected module ${name}`);
  },
});
for (const name of ['訪問介護計画書', '訪問介護予防計画書（予防プラン）', '介護予防訪問介護計画書', '居宅介護計画書', '重度訪問介護計画書', '同行援護計画書', '行動援護計画書', '移動支援計画書', '障害サービス計画書', '障害福祉サービス個別計画書']) {
  assert.equal(api.isMonitoringSignedPlanName(name), true, name);
}
assert.equal(api.isProviderMonitoringPlanName('訪問介護計画書（介護プラン）'), true);
assert.equal(api.isProviderMonitoringPlanName('障害サービス計画書（障害プラン）'), false);
const selected = api.selectMonitoringSignedPlan([
  { id: 'support-plan', doc_name: '障害サービス計画書（障害プラン）', applicable_date: '2026-07-23', doc_date_raw: null, created_at: '2026-07-23', ocr_text: '', summary: '' },
  { id: 'provider-plan', doc_name: '訪問介護計画書（介護プラン）', applicable_date: '2026-06-29', doc_date_raw: null, created_at: '2026-06-29', ocr_text: '', summary: '' },
], '2026-09-30');
assert.equal(selected.id, 'provider-plan');
assert.equal(api.isMonitoringSignedPlanName('サービス等利用計画'), false);
const fields = api.extractMonitoringSignedPlanFields('本人の希望: 自宅で生活を続けたい。\n家族の希望: 元気に暮らしてほしい。\n解決すべき課題: 体力低下。\n長期目標: 散歩を楽しく続ける。\nサービス内容: 掃除');
assert.equal(fields.assistance_goal, '散歩を楽しく続ける。');
assert.equal(fields.client_request, '自宅で生活を続けたい。');
const noisyFields = api.extractMonitoringSignedPlanFields('家族の希望: ご自分で出来ることは自宅で続け、安心して過ごして欲しい。\n日常生活自立度Ⅰ（認知症）\n自立IIIaIIbIIIaIIIbIVM子。ヘルパー支援にて‘/‘]、ノ-/1一');
assert.equal(noisyFields.family_request, 'ご自分で出来ることは自宅で続け、安心して過ごして欲しい。');
console.log('PASS: supported signed-plan names and long-term goal fallback');
