const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const source = ts.transpileModule(fs.readFileSync('src/lib/monitoring/faxTarget.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const api = {};
vm.runInNewContext(source, { exports: api, require: () => ({}) });

const base = {
  fax_id: 'phonebook-id',
  office_name: '相談支援事業所',
  contact_name: '担当者',
  fax_number: null,
  email_address: null,
  registered_office_name: '相談支援事業所',
  registered_contact_name: '担当者',
};
assert.equal(api.monitoringDeliveryMethod({ ...base, email_address: 'office@example.com', fax_number: 'not-a-fax' }), 'email');
assert.equal(api.validateMonitoringFaxTarget({ ...base, email_address: 'office@example.com', fax_number: 'not-a-fax' }), null);
assert.equal(api.monitoringDeliveryMethod({ ...base, fax_number: '03-1234-5678' }), 'fax');
assert.match(api.validateMonitoringFaxTarget({ ...base, fax_number: 'not-a-fax' }), /メールアドレスまたはFAX番号/);
console.log('PASS: valid email permits delivery even when FAX is missing or invalid');
