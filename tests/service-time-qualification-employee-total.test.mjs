import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const migration = await readFile(fileURLToPath(new URL('../supabase/migrations/202610071000_visit_care_employee_total_service_hours.sql', import.meta.url)), 'utf8');

test('訪問介護だけ社員の他サービス時間を総時間へ加算する', () => {
  assert.match(migration, /lower\(coalesce\(staff\.system_role, ''\)\) in \('admin', 'manager'\)/);
  assert.match(migration, /'訪問介護' as service_category/);
  assert.match(migration, /service_category <> '訪問介護'/);
  assert.match(migration, /false as qualified/);
});

test('林淳之さんは訪問介護の集計から除外する', () => {
  assert.match(migration, /concat_ws\('', staff\.last_name_kanji, staff\.first_name_kanji\) = '林淳之'/);
  assert.match(migration, /not \(service_category = '訪問介護' and is_hayashi\)/);
  assert.match(migration, /not is_hayashi/);
});
