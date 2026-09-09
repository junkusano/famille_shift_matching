const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const source = ts.transpileModule(fs.readFileSync('src/lib/monitoring/bulk.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

async function scenario(options = {}) {
  const calls = [];
  const context = { signed_plan: { client_request: '希望', family_request: '', issues: '' }, assessment: { assessment_id: 'assessment' }, plan: null, goals: [], visit_records: [{ evidence_id: 'visit' }], service_type_detected: 'disability', fax_target: { fax_id: 'fax', office_name: '相談事業所', fax_number: options.noFax ? null : '0312345678' }, team_contacts: [{ name: '担当', phone: '0312345678' }], client: { name: 'テスト利用者' }, office_notice: '共通通知', ...options.context };
  const db = { from(table) {
    let action = 'select', value;
    const query = new Proxy({}, { get(_, key) {
      if (key === 'then') return (resolve) => {
        calls.push({ table, action, value });
        let data = [];
        if (table === 'client_monitorings') data = action === 'insert' ? { id: 'monitor', ...value } : action === 'select' ? (options.existing ? { id: 'existing' } : null) : null;
        if (table === 'event_tasks') data = { id: 'task' };
        if (table === 'monitoring_fax_history') data = { id: 'fax-history' };
        if (table === 'client_monitoring_pdf_snapshots') data = action === 'insert' ? { id: 'snapshot', filename: value.filename } : { version_no: 0, drive_file_id: 'drive' };
        resolve({ data, error: null });
      };
      return (...args) => { if (['insert', 'update'].includes(key)) { action = key; value = args[0]; } return query; };
    } });
    return query;
  } };
  const fakeRequire = name => {
    if (name === 'server-only') return {};
    if (name === 'node:crypto') return require(name);
    if (name.includes('supabase/service')) return { supabaseAdmin: db };
    if (name.includes('faximo')) return { sendFaximoFax: async () => { calls.push({ fax: true }); if (options.faxError) throw new Error('通信不明'); return { result: '000000' }; } };
    if (name.includes('google-drive')) return { uploadBufferToGoogleDrive: async () => ({ fileId: 'drive' }), downloadGoogleDriveFile: async () => Buffer.from('pdf') };
    if (name === './ai') return { generateMonitoringWithAi: async () => { calls.push({ ai: true }); return { summary: '清掃を実施した', notable_observations: [], goals: [], model: 'test' }; } };
    if (name === './audit') return { recordMonitoringEvent: async () => {} };
    if (name === './core') return { effectiveOfficeNotice: (a,b) => a || b };
    if (name === './context') return { loadMonitoringContext: async () => context };
    if (name === './pdf') return { renderMonitoringPdf: async () => Buffer.from('pdf') };
    if (name === './repository') return { getMonitoringGoals: async () => [], monitoringFilename: () => 'test.pdf' };
    if (name === './signed-plan') return { prepareMonitoringSignedPlan: async () => options.noPlan ? null : { ocr_ready: true, summary_ready: true } };
    throw new Error(`Unexpected import ${name}`);
  };
  const exports = {};
  vm.runInNewContext(source, { exports, require: fakeRequire, process, Buffer, console, crypto: require('node:crypto').webcrypto, Intl, Date, Set, Map });
  let result, error;
  try { result = await exports.processMonitoringBulkItem({ run: { id: 'run', period_start: '2026-08-01', period_end: '2026-08-31', evaluation_date: '2026-09-01', event_template_id: 'template' }, item: { client_info_id: 'client', kaipoke_cs_id: 'kaipoke', orgunitid: 'team' }, actor: { userId: 'actor', name: '担当' }, accessToken: 'mock' }); } catch (e) { error = e; }
  return { calls, result, error };
}

(async () => {
  for (const options of [{ noPlan: true }, { noFax: true }, { context: { team_contacts: [] } }]) {
    const test = await scenario(options);
    assert.equal(test.result?.status, 'task_created');
    assert.ok(test.calls.some(c => c.table === 'event_tasks' && c.value.memo.includes('早急に対応必要')));
    assert.ok(!test.calls.some(c => c.ai || c.fax || (c.table === 'client_monitorings' && c.action === 'insert')));
  }
  const duplicate = await scenario({ existing: true });
  assert.equal(duplicate.result.status, 'skipped');
  assert.ok(!duplicate.calls.some(c => c.fax || c.ai));
  const success = await scenario();
  assert.equal(success.result?.status, 'sent', success.error?.stack);
  assert.equal(success.calls.filter(c => c.fax).length, 1);
  const uncertain = await scenario({ faxError: true });
  assert.ok(uncertain.error);
  assert.equal(uncertain.calls.filter(c => c.fax).length, 1);
  console.log('PASS: document/contact/team deficiencies, existing monitoring, PDF/FAX pipeline, no automatic fax retry (all external services mocked)');
})().catch(e => { console.error(e); process.exitCode = 1; });
