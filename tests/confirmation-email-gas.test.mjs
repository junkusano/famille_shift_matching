import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../scripts/gas/sharefull-confirmation-taimee-close.gs', import.meta.url), 'utf8');
const existingTaimeeSource = readFileSync(new URL('../scripts/gas/taimee-confirmation-close-sharefull.gs', import.meta.url), 'utf8');
const context = vm.createContext({ console, Date, JSON, LockService: {}, GmailApp: {}, UrlFetchApp: {}, PropertiesService: {}, ScriptApp: {} });
vm.runInContext(existingTaimeeSource, context);
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
  const parsed = context.parseSpotOfferTaimeeConfirmationMail_(message({
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
  const parsed = context.parseSpotOfferTaimeeConfirmationMail_(message({
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
  const valid = context.parseSpotOfferTaimeeConfirmationMail_(message({
    from: 'supporter@timee.co.jp',
    subject: 'マッチングのお知らせ',
    body: 'ワーカーが1名マッチングしましたので、お知らせいたします。\n◆求人タイトル\n介護スタッフ\n◆日時\n2026/10/10 9:30～17:30',
  }), 'supporter@timee.co.jp');
  assert.equal(valid.taimee_job_id, undefined);
  assert.equal(valid.shift_start_date, '2026-10-10');
  assert.equal(valid.shift_start_time, '09:30');

  const incomplete = context.parseSpotOfferTaimeeConfirmationMail_(message({
    from: 'supporter@timee.co.jp',
    subject: 'マッチングのお知らせ',
    body: 'ワーカーが1名マッチングしましたので、お知らせいたします。\n◆求人タイトル\n介護スタッフ',
  }), 'supporter@timee.co.jp');
  assert.equal(incomplete, null);
});

test('送信元が一致しない確定メールは無視する', () => {
  const parsed = context.parseSpotOfferTaimeeConfirmationMail_(message({
    from: 'attacker@example.com',
    subject: 'マッチングのお知らせ',
    body: '求人ID：123456',
  }), 'supporter@timee.co.jp');
  assert.equal(parsed, null);
});

test('マッチング状況の定期通知は個別確定メールとして扱わない', () => {
  const parsed = context.parseSpotOfferTaimeeConfirmationMail_(message({
    from: 'supporter@timee.co.jp',
    subject: 'マッチング状況のお知らせ',
    body: '本日のマッチング状況です。求人タイトル：介護スタッフ\n日時：2026年10月10日 09:30',
  }), 'supporter@timee.co.jp');
  assert.equal(parsed, null);
});

test('既存のタイミーGASを同時に読み込んでも両方の処理関数が衝突しない', () => {
  assert.equal(typeof context.processTaimeeConfirmationsForSharefullClose, 'function');
  assert.equal(typeof context.processSpotOfferTaimeeConfirmationsForSharefullClose, 'function');
  assert.equal(typeof context.processSpotOfferTaimeeConfirmationsForSharefullCloseLocked_, 'function');

  const existingParserResult = context.parseTaimeeConfirmationMail_(message({
    from: 'タイミー <supporter@timee.co.jp>',
    subject: 'マッチングのお知らせ',
    body: '求人ID: 123456\n応募ID: app-1\n確定',
  }), {
    senderEmail: 'supporter@timee.co.jp',
    confirmedRegex: /確定/,
    jobIdRegex: /求人ID:\s*(\d+)/,
    applicationKeyRegex: /応募ID:\s*(\S+)/,
    applicantNameRegex: /氏名:\s*(\S+)/,
  });

  assert.equal(existingParserResult.taimee_job_id, '123456');
  assert.equal(existingParserResult.application_key, 'app-1');
});

test('統合版の5分ハンドラーが新しいタイミー停止処理を呼び出す', () => {
  const calls = [];
  context.PropertiesService = { getScriptProperties: () => ({ setProperty: () => {} }) };
  context.LockService = { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) };
  context.processSharefullConfirmationsForTaimeeCloseLocked_ = () => calls.push('sharefull');
  context.processSpotOfferTaimeeConfirmationsForSharefullCloseLocked_ = () => calls.push('taimee');

  context.processSpotOfferConfirmationEmails();

  assert.deepEqual(calls, ['sharefull', 'taimee']);
});

test('統合トリガー導入時に旧単独トリガーを削除し、5分トリガーを1つ登録する', () => {
  const deleted = [];
  const created = [];
  const properties = new Map([
    ['MYFAMILLE_API_BASE_URL', 'https://myfamille.shi-on.net'],
    ['SHAREFULL_CONFIRMATION_GAS_TOKEN', 'sharefull-test-token'],
    ['SHAREFULL_CONFIRMATION_GMAIL_QUERY', 'from:sharefull@example.com'],
    ['SHAREFULL_CONFIRMATION_FROM_EMAIL', 'sharefull@example.com'],
    ['TAIMEE_CONFIRMATION_GAS_TOKEN', 'taimee-test-token'],
    ['TAIMEE_CONFIRMATION_GMAIL_QUERY', 'from:supporter@timee.co.jp'],
    ['TAIMEE_CONFIRMATION_FROM_EMAIL', 'supporter@timee.co.jp'],
  ]);
  context.PropertiesService = {
    getScriptProperties: () => ({
      getProperty: (key) => properties.get(key) ?? null,
      setProperty: (key, value) => properties.set(key, value),
    }),
  };
  context.ScriptApp = {
    getProjectTriggers: () => [
      { getHandlerFunction: () => 'processSharefullConfirmationsForTaimeeClose', deleteTrigger: () => deleted.push('sharefull') },
      { getHandlerFunction: () => 'processTaimeeConfirmationsForSharefullClose', deleteTrigger: () => deleted.push('taimee') },
      { getHandlerFunction: () => 'unrelatedAutomation', deleteTrigger: () => deleted.push('unrelated') },
    ],
    deleteTrigger: (trigger) => trigger.deleteTrigger(),
    newTrigger: (handler) => ({
      timeBased: () => ({ everyMinutes: (minutes) => ({ create: () => created.push({ handler, minutes }) }) }),
    }),
  };

  context.installSpotOfferConfirmationTriggers();

  assert.deepEqual(deleted, ['sharefull', 'taimee']);
  assert.deepEqual(created, [{ handler: 'processSpotOfferConfirmationEmails', minutes: 5 }]);
  assert.ok(properties.get('SPOT_OFFER_CONFIRMATION_ACTIVATED_AT'));
});

test('必須Script Propertiesが未設定ならトリガーも有効化時刻も作らない', () => {
  const deleted = [];
  const created = [];
  const properties = new Map();
  context.PropertiesService = {
    getScriptProperties: () => ({
      getProperty: (key) => properties.get(key) ?? null,
      setProperty: (key, value) => properties.set(key, value),
    }),
  };
  context.ScriptApp = {
    getProjectTriggers: () => [{
      getHandlerFunction: () => 'processTaimeeConfirmationsForSharefullClose',
      deleteTrigger: () => deleted.push('taimee'),
    }],
    deleteTrigger: (trigger) => trigger.deleteTrigger(),
    newTrigger: (handler) => ({
      timeBased: () => ({ everyMinutes: (minutes) => ({ create: () => created.push({ handler, minutes }) }) }),
    }),
  };

  assert.throws(() => context.installSpotOfferConfirmationTriggers(), /MYFAMILLE_API_BASE_URL/);
  assert.deepEqual(deleted, []);
  assert.deepEqual(created, []);
  assert.equal(properties.has('SPOT_OFFER_CONFIRMATION_ACTIVATED_AT'), false);
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

