import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../scripts/gas/sharefull-confirmation-taimee-close.gs', import.meta.url), 'utf8');
const context = vm.createContext({ console, Date, JSON, LockService: {}, GmailApp: {}, UrlFetchApp: {}, PropertiesService: {}, ScriptApp: {} });
vm.runInContext(source, context);

function message({ from, subject, body, id = 'mail-1', date = '2026-10-09T09:00:00+09:00' }) {
  return {
    getFrom: () => from,
    getSubject: () => subject,
    getPlainBody: () => body,
    getId: () => id,
    getDate: () => new Date(date),
  };
}

test('タイミーのマッチング通知を求人IDと勤務情報から識別する', () => {
  const parsed = context.parseTaimeeConfirmationMail_(message({
    from: 'タイミー <supporter@timee.co.jp>',
    subject: 'マッチングのお知らせ',
    body: '求人ID：123456\n業務タイトル：介護スタッフ\n就業日時：2026年10月10日 09:30～17:30',
  }), 'supporter@timee.co.jp');

  assert.equal(parsed.taimee_job_id, '123456');
  assert.equal(parsed.template_title, '介護スタッフ');
  assert.equal(parsed.shift_start_date, '2026-10-10');
  assert.equal(parsed.shift_start_time, '09:30');
  assert.equal(parsed.event_id, 'mail-1');
});

test('タイミー求人IDが無いときはタイトルと日時が揃わなければ処理しない', () => {
  const valid = context.parseTaimeeConfirmationMail_(message({
    from: 'supporter@timee.co.jp',
    subject: 'マッチングのお知らせ',
    body: '求人タイトル：介護スタッフ\n勤務日時：2026/10/10 9:30～17:30',
  }), 'supporter@timee.co.jp');
  assert.equal(valid.taimee_job_id, undefined);
  assert.equal(valid.shift_start_date, '2026-10-10');
  assert.equal(valid.shift_start_time, '09:30');

  const incomplete = context.parseTaimeeConfirmationMail_(message({
    from: 'supporter@timee.co.jp',
    subject: 'マッチングのお知らせ',
    body: '求人タイトル：介護スタッフ',
  }), 'supporter@timee.co.jp');
  assert.equal(incomplete, null);
});

test('送信元が一致しない確定メールは無視する', () => {
  const parsed = context.parseTaimeeConfirmationMail_(message({
    from: 'attacker@example.com',
    subject: 'マッチングのお知らせ',
    body: '求人ID：123456',
  }), 'supporter@timee.co.jp');
  assert.equal(parsed, null);
});

