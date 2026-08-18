-- Chrome拡張のタイミー勤務者RPAを既存の応募者・案件・SMSログモデルへ統合する。
-- 人物: taimee_applicants.taimee_user_id
-- 勤務実績: taimee_applicant_jobs (applicant_id, work_date, taimee_job_id)

alter table public.taimee_applicants
  add column if not exists source text not null default 'csv',
  add column if not exists rpa_fetched_at timestamptz;

alter table public.taimee_applicant_jobs
  add column if not exists source text not null default 'rpa',
  add column if not exists sms_eligible boolean not null default true,
  add column if not exists sms_skip_reason text;

create unique index if not exists taimee_applicant_jobs_rpa_work_uq
  on public.taimee_applicant_jobs (applicant_id, work_date, taimee_job_id)
  where work_date is not null and taimee_job_id is not null;

alter table public.taimee_sms_send_logs
  add column if not exists work_date date,
  add column if not exists message_type text,
  add column if not exists offering_id text,
  add column if not exists offering_name text,
  add column if not exists skip_reason text;

-- 同じ人へ、同じ勤務日・同じ種別のSMSは最大1通。
-- CSV由来の従来ログは work_date/message_type がNULLのため対象外。
create unique index if not exists taimee_sms_send_logs_recruitment_once_uq
  on public.taimee_sms_send_logs (taimee_user_id, work_date, message_type)
  where work_date is not null and message_type is not null;

insert into public.env_variables (group_key, key_name, value)
values (
  'taimee_recruit_sms',
  'default_template',
  $$ {{work_date_phrase}}サービスに入っていただき、ありがとうございました！

ファミーユでは専用アプリ「シフ子」を利用し、毎日100件近いサービスの中から、好きな時間・好きな場所のお仕事を自由に選べます。

✨ 身体介護・同行援護・行動援護
時給2,430円～＋交通費支給（最低時給も1,530円。タイミー掲載案件より時給200～400円高い）

✨ 日払い制度あり
1日に複数サービスへ入ってまとめて申請可能。1日で1万円以上の受取も可能です。

✨ お休みもアプリで簡単申請

✨ 資格取得支援充実

▼エントリーはこちら
https://myfamille.shi-on.net/

本メッセージは、送信専用番号から送付しています。
お問い合わせは 090-9140-2642 （新川）まで。 $$
)
on conflict (group_key, key_name) do update
set value = excluded.value, updated_at = now();
