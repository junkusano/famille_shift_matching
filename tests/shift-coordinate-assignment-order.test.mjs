import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = readFileSync(new URL('../src/app/portal/shift-coordinate-legacy/page.tsx', import.meta.url), 'utf8');
const route = readFileSync(new URL('../src/app/api/shift-coordinate-rpa-request/route.ts', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../supabase/migrations/202610191200_atomic_shift_coordinate_request.sql', import.meta.url), 'utf8');

test('シフ子は担当者反映と申請登録を完了してから成功通知する', () => {
  const requestCall = page.indexOf('fetch("/api/shift-coordinate-rpa-request"');
  const successNotice = page.indexOf('✅シフト反映が完了しました');

  assert.notEqual(requestCall, -1);
  assert.notEqual(successNotice, -1);
  assert.ok(requestCall < successNotice);
  assert.equal(page.includes('supabase.from("rpa_command_requests").insert'), false);
  assert.equal(page.includes('fetch("/api/shift-assign-after-rpa"'), false);
});

test('反映APIは競合制御付きのv2割当と申請者IDを使う', () => {
  assert.match(route, /'create_shift_coordinate_request_v1'/);
  assert.match(route, /requester_id = requested_by_user_id/);
  assert.match(route, /p_requester_id: String\(requester_id\)/);
});

test('割当とRPA登録は同一DB関数で冪等に処理する', () => {
  assert.match(migration, /assign_user_to_shift_v2/);
  assert.match(migration, /insert into public\.rpa_command_requests/);
  assert.match(migration, /already requested/);
  assert.match(migration, /request_details ->> 'shift_id'/);
});

test('反映成功後はシフ子の候補一覧から対象シフトを除外する', () => {
  assert.match(page, /setShifts\(\(current\) => current\.filter\(\(item\) => item\.shift_id !== shift\.shift_id\)\)/);
  assert.match(page, /setFilteredShifts\(\(current\) => current\.filter\(\(item\) => item\.shift_id !== shift\.shift_id\)\)/);
});
