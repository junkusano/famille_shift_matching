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
const aiSource = fs.readFileSync('src/lib/monitoring/ai.ts', 'utf8');
assert.match(aiSource, /根拠がなければ、その目標をgoalsに含めず/);
assert.match(aiSource, /確認できなかったことや情報不足を理由に、情報共有・提案が必要とは書かないでください/);
assert.match(aiSource, /function goalEvaluationValue/);
console.log('PASS: blank goal evaluations are omitted while actual comments remain visible');
