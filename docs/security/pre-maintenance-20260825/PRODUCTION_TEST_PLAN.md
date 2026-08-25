# Production test plan

These tests are for the maintenance window after backup and per-phase application. No destructive attack test is run before then. Use dedicated test records and clean them up through the application.

## Application checklist

- Login/logout, rejected unauthenticated portal access, staff and manager role routing
- User/client list and detail
- Monthly/weekly shift, shift coordination, shift wishes, shift records, visit records
- Assessments, plans, monitoring and monitoring PDF
- Client documents and Google Drive upload/download/copy paths
- Entry/re-entry, attachment upload, duplicate handling, notification
- Expense reimbursement and signed receipt access
- Shifuko-related portal display/notification paths present in the source
- RPA requests and Taimee RPA
- Runner heartbeat/claim/complete/fail (blocked until routes exist)
- GAS EntryDoc and LINE WORKS sync
- voice54 login, recording options, transcription upload/result
- Every registered cron: unauthenticated 401 and scheduled/authorized success
- SMS, FAX, LINE WORKS, Google Drive
- Storage: public bento view/admin upload; private expense receipt; monitoring PDF

## Anon-key attack suite

For each sensitive target, attempt REST SELECT/INSERT/UPDATE/DELETE using only the anon key and no user JWT. Expect permission denied or no visible rows; never return sensitive values.

Targets: `users`, `users_lw_temp`, `form_entries`, `cs_kaipoke_info`, `cm_kaipoke_info`, `cs_docs`, `shift`, `shift_records`, `fax`, `fax_log`, `expense_reimbursements`, `user_advance_payment_applications`, `env_variables`, contract tables, document tables, login/OTP tables, audit/log tables, and every sensitive view in `generated/view_audit.csv`.

RPC attempts: `exec_sql`, `read_secret`, user update/sync routines, shift mutation routines, entry submission, and every SECURITY DEFINER function in `generated/function_audit.csv`. Expect denial except the intentionally public server API path, which must not expose RPC credentials.

Allowed anonymous surface: only the narrow active certificate rows in `user_doc_master` and intentional public bento object GETs. Confirm no extra columns/rows or bucket listing are exposed.

## Authenticated JWT suite

Run with a general staff JWT, a manager/admin JWT, and an applicant/limited JWT where applicable:

- Necessary own/team rows are readable.
- Unrelated and other-user rows are not readable.
- Writes are limited by ownership/role and cannot change identity, role, or protected fields.
- Views return no rows beyond their base-table policies.
- Direct REST calls cannot bypass application UI restrictions.

## Service-role suite

- My Famille Route Handlers and internal APIs
- All registered cron jobs, including LINE WORKS master/users
- Phase 2 GAS APIs
- Entry RPC and attachment reconciliation
- RPA APIs and runner APIs once implemented
- voice54 Edge Functions
- Storage signed URLs/uploads and Google Drive workflows

For each, verify operation, error handling, idempotency where expected, and absence of credential values in response/logs.

## Gate evidence

Record timestamp, operator, phase, request/test identifier, expected/actual result, sanitized error, and rollback decision. A single unexpected allow or production feature failure blocks the next phase.

