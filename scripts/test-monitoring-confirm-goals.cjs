const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const source = ts.transpileModule(
  fs.readFileSync('src/app/api/monitorings/[id]/confirm/route.ts', 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText;

async function run({ contextGoals }) {
  const calls = [];
  let goals = [];
  const api = {};
  const supabaseAdmin = {
    from(table) {
      return {
        insert(rows) {
          calls.push({ table, rows });
          if (table === 'client_monitoring_goals') goals = rows;
          return { then: (resolve) => resolve({ error: null }) };
        },
        update(value) {
          calls.push({ table, value });
          return { eq: () => ({ then: (resolve) => resolve({ error: null }) }) };
        },
      };
    },
  };
  vm.runInNewContext(source, {
    exports: api,
    require(name) {
      if (name === 'next/server') return { NextResponse: { json: (body, init = {}) => ({ body, status: init.status ?? 200 }) } };
      if (name.includes('supabase/service')) return { supabaseAdmin };
      if (name.includes('monitoring/auth')) return {
        requireMonitoringActor: async () => ({ userId: 'user', name: '担当' }),
        monitoringAuthErrorResponse: (error) => ({ message: error.message, status: 500 }),
      };
      if (name.includes('monitoring/audit')) return { recordMonitoringEvent: async () => {} };
      if (name.includes('monitoring/context')) return { loadMonitoringContext: async () => ({ goals: contextGoals }) };
      if (name.includes('monitoring/repository')) return {
        getMonitoringRecord: async () => ({ id: 'monitoring', client_info_id: 'client', period_start: '2026-09-01', period_end: '2026-09-30', evaluation_date: '2026-10-01', service_type: 'care_insurance', summary: '本文' }),
        getMonitoringGoals: async () => goals,
      };
      throw new Error(`Unexpected module ${name}`);
    },
  });
  return { response: await api.POST({}, { params: Promise.resolve({ id: 'monitoring' }) }), calls };
}

(async () => {
  const success = await run({
    contextGoals: [{ goal_id: 'plan-goal', parent_goal_id: null, goal_type: 'long_term', goal_text: '目標', evaluation_start: null, evaluation_end: null }],
  });
  assert.equal(success.response.status, 200);
  assert.equal(success.calls.find((call) => call.table === 'client_monitoring_goals').rows.length, 1);

  const missing = await run({ contextGoals: [] });
  assert.equal(missing.response.status, 400);
  assert.equal(missing.response.body.error, '介護保険型の確定には評価対象の目標が必要です');
  console.log('PASS: care-insurance confirmation restores missing saved goals from the signed plan');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
