const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const source = ts.transpileModule(fs.readFileSync('src/lib/monitoring/auth.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const api = {};
vm.runInNewContext(source, {
  exports: api,
  require(name) {
    if (name === 'server-only') return {};
    if (name.includes('getUserFromBearer')) return {};
    if (name.includes('supabase/service')) return {};
    throw new Error(`Unexpected module ${name}`);
  },
});

assert.equal(
  api.monitoringAuthErrorResponse({
    message: "Could not find the 'delivery_method' column of 'monitoring_fax_history' in the schema cache",
  }).message,
  'モニタリング送付のDB更新が未適用です。管理者へ連絡してください。',
);
assert.equal(
  api.monitoringAuthErrorResponse({ message: 'database temporarily unavailable' }).message,
  'database temporarily unavailable',
);
assert.notEqual(api.monitoringAuthErrorResponse({}).message, '[object Object]');
console.log('PASS: monitoring API errors use a clear message instead of object stringification');
