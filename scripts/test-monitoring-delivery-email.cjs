const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const source = ts.transpileModule(fs.readFileSync('src/lib/monitoring/deliveryEmail.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const api = {};
vm.runInNewContext(source, {
  exports: api,
  require: (name) => {
    if (name === 'server-only') return {};
    if (name === '@/lib/email') return { sendEmail: async () => ({ status: 'error', error: { code: 'provider_error' } }) };
    throw new Error(`Unexpected import ${name}`);
  },
  Buffer,
  process,
});

(async () => {
  const failed = await api.sendMonitoringPdfEmail({
    to: 'office@example.com',
    officeName: '送付先',
    clientName: '利用者',
    periodStart: '2026-09-01',
    periodEnd: '2026-09-30',
    filename: 'monitoring.pdf',
    pdf: Buffer.from('pdf'),
  });
  assert.equal(failed.status, 'failed');
  assert.equal(failed.error, 'メール送信に失敗しました');
  assert.notEqual(failed.error, '[object Object]');
  console.log('PASS: email provider objects are converted to a clear delivery error');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
