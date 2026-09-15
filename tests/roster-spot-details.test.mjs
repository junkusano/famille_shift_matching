import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const context = vm.createContext({ exports: {} });
vm.runInContext(ts.transpileModule(readFileSync(new URL('../src/lib/roster/spotDetails.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, context);
const { confirmedPhone, taimeeJobUrl } = context.exports;
test('求人URLが未保存でも求人IDからリンクを作る', () => {
    assert.equal(taimeeJobUrl('123'), 'https://app-new.taimee.co.jp/clients/263546/offerings/123');
    for (const value of [null, undefined, '', '../123', 'https://example.com']) assert.equal(taimeeJobUrl(value), null);
});
test('確定者本人の番号だけ表示し、同姓同名・未取得では推測しない', () => {
    const person = { last_name: '山田', first_name: '太郎', phone: '09000000000' };
    assert.equal(confirmedPhone('山田　太郎', [person]), person.phone);
    assert.equal(confirmedPhone('山田 花子', [person]), null);
    assert.equal(confirmedPhone(null, [person]), null);
    assert.equal(confirmedPhone('山田太郎', [person, person]), null);
    assert.equal(confirmedPhone('山田太郎', [{ ...person, phone: null }]), null);
});
