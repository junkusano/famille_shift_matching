const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const compiled = ts.transpileModule(fs.readFileSync('src/lib/monitoring/core.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const api = {};
vm.runInNewContext(compiled, { exports: api });

assert.equal(api.hasMonitoringGoalComment('', ''), false);
assert.equal(api.hasMonitoringGoalComment('  ', '\n'), false);
assert.equal(api.hasMonitoringGoalComment('外出時に目的地まで安全に移動できた。', ''), true);
assert.equal(api.hasMonitoringGoalComment('', '支援上の課題を担当者へ共有する。'), true);
assert.equal(
  api.enrichMonitoringSummary('居室の掃除を実施した。', ['調理の下拵えとゴミ捨てを行った。']),
  '居室の掃除を実施した。\n調理の下拵えとゴミ捨てを行った。',
);
assert.equal(
  api.enrichMonitoringSummary('居室の掃除を実施した。', ['居室の掃除を実施した。']),
  '居室の掃除を実施した。',
);
assert.equal(
  api.enrichMonitoringSummary('あ'.repeat(520), ['観察事項は追記しない。']),
  'あ'.repeat(520),
);
assert.equal(
  api.enrichMonitoringSummary('本文。', ['い'.repeat(900)]),
  '本文。',
);
const aiSource = fs.readFileSync('src/lib/monitoring/ai.ts', 'utf8');
assert.match(aiSource, /根拠がなければ、その目標をgoalsに含めず/);
assert.match(aiSource, /確認できなかったことや情報不足を理由に、情報共有・提案が必要とは書かないでください/);
assert.match(aiSource, /function goalEvaluationValue/);
assert.match(aiSource, /観察事項だけを本文の代わりにしてはいけません/);
console.log('PASS: blank goal evaluations are omitted while actual comments remain visible');
