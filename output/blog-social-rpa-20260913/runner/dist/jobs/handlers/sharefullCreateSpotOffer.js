function isPayload(value) {
    if (typeof value !== 'object' || value === null || Array.isArray(value))
        return false;
    const data = value;
    return data.action === 'create_sharefull_job'
        && data.command === 'create_spot_offer'
        && typeof data.operation_key === 'string'
        && typeof data.spot_offer_request_id === 'string'
        && typeof data.sharefull_template_id === 'string'
        && /^\d{4}-\d{2}-\d{2}$/.test(String(data.shift_start_date))
        && typeof data.shift_start_time === 'string'
        && typeof data.shift_end_time === 'string';
}
export function createSharefullCreateSpotOfferHandler(bridge) {
    return async (payload, signal, job) => {
        if (!bridge)
            throw new Error('RPA_EXTENSION_TOKEN is not configured; Chrome extension bridge is unavailable');
        if (!isPayload(payload))
            throw new Error('Invalid Sharefull spot offer payload');
        return bridge.execute({ ...(job ?? {}), id: job?.id ?? 'extension-command', job_type: 'sharefull.create_spot_offer', payload }, signal);
    };
}
//# sourceMappingURL=sharefullCreateSpotOffer.js.map