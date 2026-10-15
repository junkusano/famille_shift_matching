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

test('タイミー求人URLのIDを業務タイトル内の事業所IDより優先する', () => {
  const parsed = context.parseTaimeeConfirmationMail_(message({
    from: 'タイミー <supporter@timee.co.jp>',
    subject: 'マッチングのお知らせ',
    body: 'ワーカーが1名マッチングしましたので、お知らせいたします。\n◆業務タイトル\n訪問介護@12668737@\n◆日時\n2026年10月09日 10:30～12:00\nhttps://app-new.taimee.co.jp/clients/263546/offerings/55761129',
  }), 'supporter@timee.co.jp');

  assert.equal(parsed.taimee_job_id, '55761129');
  assert.equal(parsed.template_title, '訪問介護');
  assert.equal(parsed.shift_start_date, '2026-10-09');
  assert.equal(parsed.shift_start_time, '10:30');
  assert.equal(parsed.event_id, 'mail-1');
});

test('URLがない通知では業務タイトルの@数字@を求人IDと誤認しない', () => {
  const parsed = context.parseTaimeeConfirmationMail_(message({
    from: 'タイミー <supporter@timee.co.jp>',
    subject: 'マッチングのお知らせ',
    body: 'ワーカーが1名マッチングしましたので、お知らせいたします。\n◆業務タイトル\n訪問介護@12668737@\n◆日時\n2026年10月09日 10:30～12:00',
  }), 'supporter@timee.co.jp');

  assert.equal(parsed.taimee_job_id, undefined);
  assert.equal(parsed.template_title, '訪問介護');
  assert.equal(parsed.shift_start_date, '2026-10-09');
  assert.equal(parsed.shift_start_time, '10:30');
});

test('タイミー求人IDが無いときはタイトルと日時が揃わなければ処理しない', () => {
  const valid = context.parseTaimeeConfirmationMail_(message({
    from: 'supporter@timee.co.jp',
    subject: 'マッチングのお知らせ',
    body: 'ワーカーが1名マッチングしましたので、お知らせいたします。\n◆求人タイトル\n介護スタッフ\n◆日時\n2026/10/10 9:30～17:30',
  }), 'supporter@timee.co.jp');
  assert.equal(valid.taimee_job_id, undefined);
  assert.equal(valid.shift_start_date, '2026-10-10');
  assert.equal(valid.shift_start_time, '09:30');

  const incomplete = context.parseTaimeeConfirmationMail_(message({
    from: 'supporter@timee.co.jp',
    subject: 'マッチングのお知らせ',
    body: 'ワーカーが1名マッチングしましたので、お知らせいたします。\n◆求人タイトル\n介護スタッフ',
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

test('マッチング状況の定期通知は個別確定メールとして扱わない', () => {
  const parsed = context.parseTaimeeConfirmationMail_(message({
    from: 'supporter@timee.co.jp',
    subject: 'マッチング状況のお知らせ',
    body: '本日のマッチング状況です。求人タイトル：介護スタッフ\n日時：2026年10月10日 09:30',
  }), 'supporter@timee.co.jp');
  assert.equal(parsed, null);
});

test('有効化時刻以前および同時刻のメールは処理対象外にする', () => {
  const activationTimestamp = new Date('2026-10-09T10:00:00+09:00').getTime();
  const before = message({ date: '2026-10-09T09:59:59+09:00' });
  const atActivation = message({ date: '2026-10-09T10:00:00+09:00' });
  const after = message({ date: '2026-10-09T10:00:01+09:00' });

  assert.equal(context.isConfirmationMessageBeforeActivation_(before, activationTimestamp), true);
  assert.equal(context.isConfirmationMessageBeforeActivation_(atActivation, activationTimestamp), true);
  assert.equal(context.isConfirmationMessageBeforeActivation_(after, activationTimestamp), false);
});

