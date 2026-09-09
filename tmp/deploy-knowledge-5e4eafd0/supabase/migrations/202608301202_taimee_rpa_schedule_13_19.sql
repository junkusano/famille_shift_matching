-- 初期のテスト完了後に有効化する定時予定。自動有効化はしない。
update public.rpa_job_definitions
set schedule = '{"timezone":"Asia/Tokyo","times":["13:00","19:00"]}'::jsonb
where job_type = 'taimee.daily_worker_follow_sms'
  and schedule = '{"timezone":"Asia/Tokyo","times":["10:00"]}'::jsonb;
