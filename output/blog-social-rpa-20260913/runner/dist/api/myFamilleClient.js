export class ApiRequestError extends Error {
    status;
    constructor(status, path) {
        super(`My Famille API request failed: ${status} ${path}`);
        this.status = status;
        this.name = 'ApiRequestError';
    }
}
function isRecord(value) {
    return typeof value === 'object' && value !== null;
}
function parseJob(value) {
    if (value === null)
        return null;
    if (!isRecord(value) || typeof value.id !== 'string' || typeof value.job_type !== 'string') {
        throw new Error('Invalid job returned by My Famille API');
    }
    if (value.timeout_ms !== undefined && (typeof value.timeout_ms !== 'number' || !Number.isSafeInteger(value.timeout_ms) || value.timeout_ms <= 0)) {
        throw new Error('Invalid job timeout returned by My Famille API');
    }
    return { id: value.id, job_type: value.job_type, payload: value.payload, ...(value.timeout_ms === undefined ? {} : { timeout_ms: value.timeout_ms }) };
}
export class MyFamilleClient {
    config;
    fetchFn;
    constructor(config, fetchFn = fetch) {
        this.config = config;
        this.fetchFn = fetchFn;
    }
    async sendProgress(events) {
        await this.request('/api/rpa/events', { runner_id: this.config.runnerId, events });
    }
    async sendHeartbeat(input) {
        await this.request('/api/rpa/runner/heartbeat', {
            runner_id: this.config.runnerId, runner_name: this.config.runnerName,
            status: input.status, current_job_id: input.currentJobId, runner_version: this.config.runnerVersion,
        });
    }
    async claimJob() {
        const response = await this.request('/api/rpa/jobs/claim', { runner_id: this.config.runnerId });
        if (!isRecord(response) || typeof response.ok !== 'boolean')
            throw new Error('Invalid claim response returned by My Famille API');
        return { ok: response.ok, job: parseJob(response.job) };
    }
    async completeJob(jobId, result) {
        await this.request(`/api/rpa/jobs/${encodeURIComponent(jobId)}/complete`, { runner_id: this.config.runnerId, result });
    }
    async failJob(jobId, failure) {
        await this.request(`/api/rpa/jobs/${encodeURIComponent(jobId)}/fail`, {
            runner_id: this.config.runnerId, error_code: failure.errorCode, error_type: failure.errorType,
            error_message: failure.errorMessage, error_category: failure.errorCategory, retry_count: failure.retryCount, debug: failure.debug,
        });
    }
    async request(path, body) {
        const response = await this.fetchFn(`${this.config.apiBaseUrl}${path}`, {
            method: 'POST',
            signal: AbortSignal.timeout(15000),
            headers: { Authorization: `Bearer ${this.config.runnerToken}`, 'Content-Type': 'application/json', 'X-RPA-Runner-ID': this.config.runnerId },
            body: JSON.stringify(body),
        });
        if (!response.ok)
            throw new ApiRequestError(response.status, path);
        if (response.status === 204)
            return undefined;
        return response.json();
    }
}
//# sourceMappingURL=myFamilleClient.js.map