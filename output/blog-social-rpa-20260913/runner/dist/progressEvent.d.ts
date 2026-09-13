export declare const eventCodes: readonly ['job_received', 'attempt_started', 'retry_scheduled', 'job_completed', 'job_failed', 'extension_requested', 'extension_received', 'extension_completed', 'extension_failed', 'list_started', 'list_completed', 'worker_progress', 'phone_started', 'sms_started', 'sms_completed', 'day_skipped', 'api_started', 'api_completed', 'template_step', 'outbox_expired'];
export type EventCode = typeof eventCodes[number];
export type ProgressEvent = {
    event_id: string;
    job_id: string | null;
    run_id: string;
    attempt: number;
    source: 'runner' | 'extension' | 'api';
    code: EventCode;
    occurred_at: string;
    version: string;
    data: Record<string, string | number | boolean>;
};
export declare function cleanEvent(input: unknown): ProgressEvent | null;
//# sourceMappingURL=progressEvent.d.ts.map