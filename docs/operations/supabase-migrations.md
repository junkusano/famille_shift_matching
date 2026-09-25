# Supabaseマイグレーション運用

## 方針

- SQLスキーマ変更は、必ず `supabase/migrations/` にSQLファイルとして保存する。
- SQLファイルをGitにcommitしてから、Supabaseクラウドへ適用する。
- Supabase SQL Editorで直接変更した場合は、同じ変更をSQLマイグレーションとしてGitにも記録する。
- `supabase db push` の前に `supabase migration list` と `supabase db push --dry-run` を実行する。
- ローカルSupabase DBは必須としない。リンク済みのSupabaseクラウドを適用先とする。

## 通常の変更手順

```powershell
cd C:\Users\サービスサポート\famille_shift_matching
git pull --rebase
git status
npx supabase migration list
npx supabase db push --dry-run
```

適用対象とSQLを確認してから、次を実行する。

```powershell
npx supabase db push
git status
git add supabase/migrations/<migration-file>.sql
git commit -m "Add <migration description> migration"
git push origin master
```

## 履歴不一致時の禁止事項

ローカルとリモートの履歴が一致しない場合、`--include-all` や `migration repair`を内容確認なしで実行しない。

先に以下を確認する。

1. リモートにしかないバージョンのSQLをGit履歴または他の作業PCから復元する。
2. ローカルにしかないSQLが、実際にリモートへ適用済みか確認する。
3. SQLの適用済み・未適用を確認してから、必要な履歴だけを修復する。
4. `migration list`で不一致が解消されたことを確認する。

## Sharefull RPAテスト環境

テスト用マイグレーションは次のファイルで管理する。

```text
supabase/migrations/202609251100_add_sharefull_rpa_test_tables.sql
```

このマイグレーションは、次のテーブルと投入関数を追加する。

- `sharefull_rpa_test_spot_offer_template_unified`
- `sharefull_rpa_test_spot_offer_request_table`
- `sharefull_rpa_test_spot_offer_applications`
- `sharefull_rpa_test_spot_offer_application_events`
- `seed_sharefull_rpa_test_data(text)`
- `record_sharefull_rpa_test_application(...)`

本番DBの履歴が整理されるまでは、全マイグレーションをまとめてpushせず、このSQLだけをSupabase SQL Editorで適用する。その場合も、適用したSQLファイルと実行結果をGitに残す。

適用後のテストデータ投入：

```sql
select public.seed_sharefull_rpa_test_data('12782561');
```
