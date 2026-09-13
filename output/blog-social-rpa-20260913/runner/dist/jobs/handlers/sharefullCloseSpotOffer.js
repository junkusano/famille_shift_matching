export function createSharefullCloseSpotOfferHandler(bridge) {
    return async (payload, signal, job) => {
        if (!bridge)
            throw new Error('Chrome extension bridge is unavailable');
        const data = payload;
        if (!data || typeof data !== 'object' || Array.isArray(data)
            || typeof data.sharefull_order_id !== 'string' || !/^[1-9]\d*$/.test(data.sharefull_order_id)
            || (data.sharefull_job_id !== undefined && (typeof data.sharefull_job_id !== 'string' || !/^[1-9]\d*$/.test(data.sharefull_job_id))))
            throw new Error('Invalid Sharefull close payload');
        return bridge.execute({ ...(job ?? {}), id: job?.id ?? 'extension-command', job_type: 'sharefull.close_spot_offer', payload }, signal);
    };
}
//# sourceMappingURL=sharefullCloseSpotOffer.js.map