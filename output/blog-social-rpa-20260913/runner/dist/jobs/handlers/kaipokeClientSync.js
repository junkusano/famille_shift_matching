export function createKaipokeClientSyncHandler(bridge) {
    return async (payload, signal, job) => {
        if (!bridge)
            throw new Error('RPA_EXTENSION_TOKEN is not configured; Chrome extension bridge is unavailable');
        if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
            throw new Error('Invalid Kaipoke client sync payload');
        }
        const data = payload;
        if (typeof data.dry_run !== 'boolean')
            throw new Error('Invalid Kaipoke client sync payload');
        if (data.max_clients !== undefined
            && (typeof data.max_clients !== 'number' || !Number.isSafeInteger(data.max_clients)
                || data.max_clients < 1 || data.max_clients > 500)) {
            throw new Error('Invalid Kaipoke client sync payload');
        }
        const result = await bridge.execute({ ...(job ?? {}), id: job?.id ?? 'extension-command', job_type: 'kaipoke.client_sync', payload: data }, signal);
        if (result.success === false) {
            const updated = typeof result.upserted_count === 'number' ? result.upserted_count : 0;
            const failed = typeof result.failure_count === 'number' ? result.failure_count : 0;
            throw new Error(`KAIPOKE_CLIENT_SYNC_FAILED: 更新 ${updated}件 / 失敗 ${failed}件。RPA診断で詳細を確認してください。`);
        }
        return result;
    };
}
//# sourceMappingURL=kaipokeClientSync.js.map