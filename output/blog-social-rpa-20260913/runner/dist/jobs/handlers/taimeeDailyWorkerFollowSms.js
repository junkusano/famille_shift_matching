export function createTaimeeDailyWorkerFollowSmsHandler(bridge) {
    return async (payload, signal, job) => {
        if (!bridge)
            throw new Error('RPA_EXTENSION_TOKEN is not configured; Chrome extension bridge is unavailable');
        if (typeof payload !== 'object' || payload === null || Array.isArray(payload))
            throw new Error('Invalid taimee daily worker follow payload');
        const data = payload;
        if (data.client_id !== '263546' || !Array.isArray(data.days) || !data.days.every((day) => Number.isSafeInteger(day) && day <= 0 && day >= -31) || typeof data.dry_run !== 'boolean')
            throw new Error('Invalid taimee daily worker follow payload');
        return bridge.execute({ ...(job ?? {}), id: job?.id ?? 'extension-command', job_type: 'taimee.daily_worker_follow_sms', payload: data }, signal);
    };
}
//# sourceMappingURL=taimeeDailyWorkerFollowSms.js.map