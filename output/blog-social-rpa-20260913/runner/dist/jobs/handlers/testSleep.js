export class InvalidJobPayloadError extends Error {
    constructor(message) { super(message); this.name = 'InvalidJobPayloadError'; }
}
function readDuration(payload) {
    if (typeof payload !== 'object' || payload === null || !('duration_ms' in payload))
        throw new InvalidJobPayloadError('test.sleep payload requires duration_ms');
    const duration = payload.duration_ms;
    if (typeof duration !== 'number' || !Number.isSafeInteger(duration) || duration < 0)
        throw new InvalidJobPayloadError('test.sleep duration_ms must be a non-negative integer');
    return duration;
}
function sleep(durationMs, signal) {
    return new Promise((resolve, reject) => {
        if (signal.aborted) {
            reject(signal.reason ?? new Error('Job aborted'));
            return;
        }
        const timer = setTimeout(resolve, durationMs);
        signal.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason ?? new Error('Job aborted')); }, { once: true });
    });
}
export async function testSleep(payload, signal) {
    const durationMs = readDuration(payload);
    await sleep(durationMs, signal);
    return { message: 'test.sleep completed', duration_ms: durationMs };
}
//# sourceMappingURL=testSleep.js.map