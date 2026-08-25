# Pre-maintenance final validation (2026-08-25)

## Conclusion

The code and snapshot audit is complete, but production RLS application is **not ready**. No production deployment, GAS push, database DDL/DML, Storage change, or credential rotation was performed in this validation session. The operator previously reported that the My Famille API had been deployed, but this audit did not independently match that deployment to the reviewed commit; GAS push remains unperformed.

The stop decision is caused by unresolved RED blockers, not by the Phase 2 LINE WORKS data repair. That repair remains consistent with the supplied result: 152 temporary users, 149 matched users, 149 exact `users.lw_userid` matches, 0 mismatches, 3 unmatched, and 0 invalid duplicates.

## Evidence and scope

- Main source inventory: `generated/source_supabase_usage.csv` (1,583 rows; includes heuristic candidates and a `catalog_match` field)
- Table/RLS/GRANT inventory: `generated/table_rls_grant_classification.csv` (183 public tables)
- Views: `generated/view_audit.csv` (65)
- Functions/RPC: `generated/function_audit.csv` (315)
- Policies: `generated/policy_audit.csv` (68)
- Sensitive exposure candidates: `generated/sensitive_columns_exposed.csv` (94)
- RLS-off with browser-role grants: `generated/rls_disabled_with_grants.csv` (117)
- Credential heuristics (values omitted): `generated/credential_findings.csv`
- Google Drive heuristics: `generated/google_drive_findings.csv`
- Snapshot: `C:\Users\USER\Downloads\supabase-pre-rls-20260824_000200`

The public-schema result is snapshot-based (2026-08-24). A fresh production catalog read was not performed in this maintenance-excluded session.

## Client/server and credential findings

- Browser client, Server Component, Route Handler, Server Action, Cron, Webhook/RPA/internal API, and library uses are classified per source row in the source inventory.
- No `"use client"` file uses a service-role credential and no `NEXT_PUBLIC_*` service-role variable was found.
- Three server-side credential-fragment leaks were found and removed locally: full LINE WORKS access-token response/logging, token-prefix logging, and cron token preview logging.
- `/api/cron/sync-lineworks-master-all`, `sync-lineworks-users`, and `refreshAccessToken` now use the existing cron authentication locally.
- The public entry API now validates submission UUID, applicant fields, consent, upload slot, MIME type, and 4 MiB limit. The unreachable legacy browser-side direct insert and sensitive payload log were removed.
- The two Phase 2 RPA endpoints are exact middleware exceptions and still authenticate inside their Route Handlers; the middleware does not open all `/api/rpa/*`.

## Public schema and Security Advisor causes

- Tables: 183; RLS ON 66; RLS OFF 117.
- All 117 RLS-off tables currently have anon and/or authenticated grants.
- Policies: 68; 41 contain an unconditional true condition.
- Views: 65; only 1 is `security_invoker`; 64 can execute under owner semantics and many retain browser-role grants.
- Functions: 315; 35 are SECURITY DEFINER; PUBLIC EXECUTE 305; anon EXECUTE 313; authenticated EXECUTE 313.
- `public.exec_sql(text)` is SECURITY DEFINER, owned by postgres, executes arbitrary supplied SQL, and is executable by PUBLIC/anon/authenticated. This is the most urgent independent Critical finding.
- `sensitive_columns_exposed` is explained by sensitive public tables/views combined with broad GRANT, RLS OFF or permissive policies, and owner-context views/functions.
- `rls_disabled_in_public` is explained by the 117 RLS-off public tables; exact priority and grant columns are in the generated table CSV.
- Materialized views in the snapshot: 0.

Table audit classes are A=45 (client-used), B=103 (server-used), C=25 (unused/unknown), D=10 (legacy/high-risk heuristic). These are audit labels; the maintenance phases use a separately reviewed 7/61/21/28 split covering the same 117 RLS-off tables exactly once.

## Component impact

### famille-voice54 — GREEN

The app exposes an anon/publishable key as expected but does not directly query public tables. It invokes `recording-options` and `transcribe-recording` Edge Functions with a user JWT. Those functions validate the JWT, then use the server-side service role for `recording_transcripts`, `users`, client lookup, and staff lookup. RLS bypass remains server-side. Production authentication and function smoke tests remain required.

### GAS — RED

The two known anon RED paths (`form_entries`, `users_lw_temp`) have local API migrations, but My Famille deployment/push state is not proven in this audit and both GAS pushes are explicitly unperformed. The broader GAS estate still contains high-privilege credentials in source and a raw Supabase credential getter. No values were printed. RLS would not stop remaining service-role paths, but the credential design is a separate production risk.

### famille-rpa — GREEN

The extension has no direct Supabase access and no embedded service-role secret. It calls My Famille RPA APIs using logged-in browser context or the Taimee operator token path. RLS impact is therefore server-side.

### famille-rpa-runner — RED

The runner has no direct Supabase access and sends `RPA_RUNNER_TOKEN` to My Famille APIs. However, the expected heartbeat/claim/complete/fail routes do not exist in the audited main application. This is a functional blocker independent of RLS.

### Storage — YELLOW

Read-only inventory: `uploads` public/0 objects; `bento-menu-images` public/15; `expense-receipts` private/1; `taimee-applicant-documents` private/0; `monitoring-pdfs` private/0. Bento images are an intentional public browser path. Expense and monitoring files use server-side signed/upload paths. The Phase G draft only makes the empty `uploads` bucket private and deletes no files. The active expense object must not be removed.

### Google Drive

Main and GAS code use Drive/shared drives for application documents, including the Phase 2 entry attachment path. No Storage-to-Drive deletion or migration is planned. Existing Storage objects remain in place.

## Draft change set

- New RLS enables: 117 (total public tables after successful completion: 183)
- New policies: 58; dropped policies: 0
- Existing RLS table grant hardening: 66 tables
- GRANT statements: 84
- REVOKE statements: 602
- View changes: 65
- Function execute targets: 315; F0 additionally locks down all 35 SECURITY DEFINER functions
- Storage metadata changes: 1 bucket; object deletes: 0
- No generated policy uses `USING (true)` or `WITH CHECK (true)`.

The SQL is syntactically structured with per-phase transactions and snapshot-derived rollback, but it has **not** been parsed/executed against a restored PostgreSQL database because no local psql/Supabase CLI or restored test database is available. Generated row-ownership policies and converting all 65 views to `security_invoker` require representative JWT integration tests before production.

## RED blockers

1. Ten Vercel-registered cron routes still lack a recognized route-level authentication check while middleware bypasses all `/api/cron/*`: `dispatch-rpa-from-talks`, `tokutei-sum-order-clone`, `auto_assign_jisseki_staff`, `disability-check-jisseki`, `cs-docs-judge-logics`, `staff-monthly-score-summaries`, `visit-record-daily-reminder`, `health-check-reminder`, `spot-offer-auto-request`, and `training-goal-reminder`.
2. `exec_sql(text)` is presently anonymous arbitrary SQL execution through SECURITY DEFINER. F0 exists but is not applied.
3. The Phase 2 My Famille API deployment was operator-reported but its exact commit is not independently proven; both GAS pushes remain unperformed in this session.
4. The RLS/view/function drafts have not been exercised against a restored snapshot with anon, representative authenticated users, and service-role flows.
5. famille-rpa-runner's required My Famille job endpoints are absent.
6. GAS still contains hard-coded high-privilege credentials/raw getter patterns outside the Phase 2 scope.
7. Public entry write endpoints have validation but no rate limit/CAPTCHA, so anonymous submission/upload abuse remains possible.
8. The catalog input is the 2026-08-24 snapshot rather than a fresh immediately-pre-change production snapshot.

## Maintenance start conditions

- Resolve or explicitly defer with documented owner/risk acceptance all ten unauthenticated cron routes.
- Add or formally remove/defer runner endpoints and prove runner behavior.
- Deploy Phase 2 API first; verify unauthorized 401 and authorized success without printing secrets.
- Verify both GAS Script Properties by presence only, push the two exact projects, and complete read-only/non-destructive smoke tests.
- Take and restore-test a fresh pre-change backup/catalog snapshot.
- Run every apply and rollback file against the restored database; complete anon/authenticated/service-role and view regression tests.
- Confirm an approved SQL execution channel and an operator for each Gate.
- Add rate limiting/CAPTCHA or obtain explicit acceptance for the public entry abuse risk.

