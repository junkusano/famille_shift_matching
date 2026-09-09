const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const compiled = ts.transpileModule(fs.readFileSync('src/lib/monitoring/core.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const api = {};
vm.runInNewContext(compiled, { exports: api });
const clean = api.cleanMonitoringGoalText;
const goal = 'ヘルパーに入ってもらうことで安心して生活を送る。必要なことはヘルパーと相談しながら地域での生活を続けていく。';
assert.equal(clean(goal + '■身体2.00時間■家事47.50時間□重訪時間サービス□通院(伴う)時間'), goal);
assert.equal(clean(goal + '\n□通院（伴ず）時間\n□乗降回数'), goal);
assert.equal(clean(goal + '■ 身体 ２．００ 時間'), goal);
assert.equal(clean('■身体機能を維持し、毎日2時間活動する。'), '■身体機能を維持し、毎日2時間活動する。');
assert.equal(clean(goal), goal);
assert.equal(clean(''), '');
console.log('PASS: service fields removed; goal prose and ordinary durations preserved');
