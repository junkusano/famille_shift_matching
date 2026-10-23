import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('typescript');

async function claim(headcount, reconcileOnly = false) {
  const updates = [];
  const job = { id: 'job-1', job_type: 'sharefull.create_spot_offer', payload: { headcount, reconcile_only: reconcileOnly } };
  const builder = { update(value) { updates.push(value); return builder; }, eq() { return builder; }, then(resolve) { return Promise.resolve({ error: null }).then(resolve); } };
  const context = vm.createContext({ exports: {}, process: { env: {} },
    NextResponse: { json: (body, options) => ({ body, options }) },
    authenticateRunner: async () => ({ runnerId: 'runner-1', environment: 'production' }),
    RpaRunnerAuthError: class extends Error {}, isRecord: (value) => !!value && typeof value === 'object',
    supabaseAdmin: { rpc: async () => ({ data: [job], error: null }), from: () => builder },
    providerSyncEnabled: () => false,
  });
  const source = readFileSync(new URL('../src/app/api/rpa/jobs/claim/route.ts', import.meta.url), 'utf8').replace(/^import .*;\r?\n/gm, '');
  vm.runInContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context);
  return { response: await context.exports.POST({ json: async () => ({ runner_id: 'runner-1' }) }), updates };
}

test('既存キューの不正人数は同期設定にかかわらずブラウザへ渡さない', async () => {
  for (const count of [-999, 0, null, undefined, 1.5, '1']) {
    const { response, updates } = await claim(count);
    assert.equal(response.body.job, null);
    assert.equal(updates[0].error_code, 'INVALID_HEADCOUNT_HELD');
  }
});
test('正しい人数と読取専用照合は既存経路を維持する', async () => {
  assert.equal((await claim(1)).response.body.job.id, 'job-1');
  assert.equal((await claim(-999, true)).response.body.job.id, 'job-1');
});
