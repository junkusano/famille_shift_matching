export const eventCodes = ['job_received', 'attempt_started', 'retry_scheduled', 'job_completed', 'job_failed', 'extension_requested', 'extension_received', 'extension_completed', 'extension_failed', 'list_started', 'list_completed', 'worker_progress', 'phone_started', 'sms_started', 'sms_completed', 'day_skipped', 'api_started', 'api_completed', 'template_step', 'outbox_expired'];
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function cleanEvent(input) {
    if (!input || typeof input !== 'object')
        return null;
    const e = input;
    if (!uuid.test(String(e.event_id)) || !uuid.test(String(e.run_id)) || (e.job_id !== null && !uuid.test(String(e.job_id))) || !Number.isInteger(e.attempt) || Number(e.attempt) < 1 || Number(e.attempt) > 100 || !['runner', 'extension', 'api'].includes(String(e.source)) || !eventCodes.includes(e.code))
        return null;
    if (typeof e.occurred_at !== 'string' || !Number.isFinite(Date.parse(e.occurred_at)))
        return null;
    const data = {};
    const raw = e.data && typeof e.data === 'object' ? e.data : {};
    for (const key of ['target_count', 'current_index', 'sent_count', 'skipped_count', 'failed_count', 'eligible_count', 'duration_ms', 'http_status', 'retry_count', 'step'])
        if (typeof raw[key] === 'number' && Number.isFinite(raw[key]) && Number(raw[key]) >= 0 && Number(raw[key]) <= 86400000)
            data[key] = raw[key];
    if (typeof raw.work_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.work_date))
        data.work_date = raw.work_date;
    if (['cases', 'workers', 'sms', 'template', 'session'].includes(String(raw.operation)))
        data.operation = String(raw.operation);
    if (typeof raw.dry_run === 'boolean')
        data.dry_run = raw.dry_run;
    if (['sent', 'duplicate', 'skipped', 'phone_not_found', 'not_selected', 'no_eligible_workers', 'failed', 'unsent'].includes(String(raw.reason)))
        data.reason = String(raw.reason);
    return { event_id: String(e.event_id), job_id: e.job_id, run_id: String(e.run_id), attempt: Number(e.attempt), source: e.source, code: e.code, occurred_at: e.occurred_at, version: typeof e.version === 'string' && /^[0-9]+(?:\.[0-9]+){1,3}(?:-[a-z0-9.-]+)?$/i.test(e.version) ? e.version : '0.0.0', data };
}
//# sourceMappingURL=progressEvent.js.map