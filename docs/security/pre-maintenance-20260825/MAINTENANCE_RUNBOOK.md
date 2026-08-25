# Maintenance runbook

Stop immediately at any failed Gate. Never continue to the next phase. Never print secret values.

## Pre-start

1. Confirm the original backup and emergency repair backup exist and re-run restore verification.
2. Capture a fresh production catalog/policy/grant/RLS/routine/view snapshot.
3. Confirm a clean, reviewed deployment commit and separate unrelated working-tree changes.
4. Run `npm run lint` and `npm run build`.
5. Verify the approved SQL executor (Supabase SQL Editor or an approved psql channel).
6. Confirm `CRON_SECRET`, `MY_FAMILLE_RPA_API_KEY`, service-role, and GAS Script Properties exist without displaying values.

## Phase A — API and GAS

1. Deploy the reviewed My Famille commit using the approved production method.
2. Call both Phase 2 APIs without the internal key; expect 401.
3. Call the attachment API with a deliberately invalid, non-writing request and a valid key; expect validation 400, not 401/500.
4. Run the LINE WORKS sync only inside the approved data-change window; verify 152/149/149/0/3/0 invariants before proceeding.
5. In `G:\マイドライブ\GAS\EntryDocMailToSupabase`, verify `.clasp.json` scriptId is unchanged and push that project only.
6. In `G:\マイドライブ\GAS\LwDataToSupabase`, verify `.clasp.json` scriptId is unchanged and push that project only.
7. Run GAS dry/read-only checks, then one approved end-to-end test per path.

Gate A: unauthorized requests fail, authorized requests succeed, no credential appears in response/log, and data invariants remain valid.

Rollback A: redeploy the prior My Famille deployment and use each GAS project's saved pre-Phase-2 local copy with the unchanged scriptId. Do not restore the old direct-anon path after RLS has started; if A fails, stop before F0/B.

## Phase F0 — emergency RPC lockdown

Execute `supabase/maintenance/20260825/05_phase_f0_emergency_rpc_lockdown.sql`.

Gate F0: anon/authenticated cannot execute `exec_sql`; server service-role cron using it still succeeds in a read-only/dry-run path; all 35 definer grants match plan.

Rollback F0 only if required: `06_rollback_phase_f0.sql`. This restores the insecure snapshot grants, so isolate the application and treat it as an emergency rollback.

## Phase B — low-complexity server-only

Execute `10_phase_b_server_only_non_sensitive.sql`; test affected server jobs; inspect errors; proceed only if clean.

Rollback: `11_rollback_phase_b.sql`.

## Phase C — sensitive/server-only

Execute `20_phase_c_sensitive_server_only.sql`; test contracts, plans, jobs, logs, LINE WORKS, calendar, and service-role routes.

Rollback: `21_rollback_phase_c.sql`.

## Phase D — direct client access

Execute `30_phase_d_client_rls.sql`; run representative staff/manager/applicant JWT tests and public certificate-master read test.

Rollback: `31_rollback_phase_d.sql`.

## Phase E — complex business data

Execute `40_phase_e_complex_business.sql`; run users, clients, shifts, records, documents, fax, entry, RPA request, organization, and payment workflows.

Rollback: `41_rollback_phase_e.sql`.

## Phase F — views and functions

Execute `50_phase_f_views_functions.sql`; test all 16 browser-used views and the four browser RPC grants. Verify other functions are denied to browser roles and service-role jobs still work.

Rollback: `51_rollback_phase_f.sql`.

## Phase G — Storage

Execute `60_phase_g_storage.sql`; verify empty `uploads` is private, public bento URLs still work, and signed expense/monitoring paths work. Delete no objects.

Rollback: `61_rollback_phase_g.sql`.

## Final Gate

Run the production checklist, anon attack suite, authenticated role suite, and service-role suite. Re-run the read-only preflight and Security Advisor. Archive SQL output and sanitized logs. If any feature fails, roll back only the most recent phase first and stop.

