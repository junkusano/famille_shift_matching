import { executeJobWithTimeout, jobHandlers } from './jobs/executeJob.js';
import { classifyFailure, sanitizeFailureMessage } from './jobFailure.js';
const wait = (durationMs) => new Promise((resolve) => setTimeout(resolve, durationMs));
class FinalJobError extends Error {
    original;
    retryCount;
    constructor(original, retryCount) {
        super(sanitizeFailureMessage(original));
        this.original = original;
        this.retryCount = retryCount;
        this.name = 'FinalJobError';
    }
}
function serializeFailure(error) {
    const original = error instanceof FinalJobError ? error.original : error;
    const retryCount = error instanceof FinalJobError ? error.retryCount : 0;
    const classification = classifyFailure(original);
    return {
        errorCode: classification.code,
        errorType: classification.category,
        errorCategory: classification.category,
        retryCount,
        errorMessage: sanitizeFailureMessage(original),
        debug: {},
    };
}
export class Runner {
    config;
    client;
    logger;
    handlers;
    progress;
    status = 'idle';
    currentJobId = null;
    heartbeatTimer;
    started = false;
    constructor(config, client, logger, handlers = jobHandlers, progress) {
        this.config = config;
        this.client = client;
        this.logger = logger;
        this.handlers = handlers;
        this.progress = progress;
    }
    async start() {
        if (this.started)
            throw new Error('Runner has already been started');
        this.started = true;
        this.logger.info(`Runner starting id=${this.config.runnerId}`);
        this.startHeartbeat();
        await this.runLoop();
        this.logger.info('Runner stopped');
    }
    async stop() {
        if (this.status === 'stopping')
            return;
        this.status = 'stopping';
        if (this.heartbeatTimer)
            clearInterval(this.heartbeatTimer);
        this.heartbeatTimer = undefined;
        if (this.currentJobId)
            this.logger.info(`Shutdown waiting for active job id=${this.currentJobId}`);
        else
            this.logger.info('Shutdown completed; no active job');
    }
    startHeartbeat() {
        void this.sendHeartbeat();
        this.heartbeatTimer = setInterval(() => void this.sendHeartbeat(), this.config.heartbeatIntervalMs);
    }
    async sendHeartbeat() {
        if (this.status === 'stopping')
            return;
        void this.progress?.flush();
        try {
            await this.client.sendHeartbeat({ status: this.status === 'busy' ? 'busy' : 'online', currentJobId: this.currentJobId });
            this.logger.info('Heartbeat sent');
        }
        catch (error) {
            this.logger.warn(`Heartbeat failed: ${this.errorMessage(error)}`);
        }
    }
    async runLoop() {
        while (this.status !== 'stopping') {
            let job;
            try {
                job = (await this.client.claimJob()).job;
            }
            catch (error) {
                this.logger.warn(`Job claim failed: ${this.errorMessage(error)}`);
                await wait(this.config.jobPollIntervalMs);
                continue;
            }
            if (!job) {
                await wait(this.config.jobPollIntervalMs);
                continue;
            }
            if (this.isStopping())
                break;
            await this.processJob(job);
        }
    }
    async processJob(job) {
        this.status = 'busy';
        this.currentJobId = job.id;
        this.logger.info(`Job claimed id=${job.id} type=${job.job_type}`);
        await this.progress?.record(job.id, 1, 'job_received').catch(() => undefined);
        try {
            const { result, retryCount } = await this.executeWithRetries(job);
            await this.client.completeJob(job.id, result);
            await this.progress?.record(job.id, retryCount + 1, 'job_completed').catch(() => undefined);
            this.logger.info(`Job completed id=${job.id} retries=${retryCount}`);
        }
        catch (error) {
            const failure = serializeFailure(error);
            await this.progress?.record(job.id, (failure.retryCount ?? 0) + 1, 'job_failed', { retry_count: failure.retryCount ?? 0 }).catch(() => undefined);
            this.logger.error(`Job failed id=${job.id}: ${failure.errorMessage}`);
            try {
                await this.client.failJob(job.id, failure);
            }
            catch (failError) {
                this.logger.error(`Failed to report job failure id=${job.id}: ${this.errorMessage(failError)}`);
            }
        }
        finally {
            this.currentJobId = null;
            if (!this.isStopping())
                this.status = 'idle';
        }
    }
    async executeWithRetries(job) {
        let retryCount = 0;
        for (let attempt = 0; attempt < 3; attempt += 1) {
            try {
                await this.progress?.record(job.id, attempt + 1, 'attempt_started').catch(() => undefined);
                const result = await executeJobWithTimeout({ ...job, attempt: attempt + 1 }, job.timeout_ms ?? this.config.defaultJobTimeoutMs, this.handlers);
                return { result, retryCount };
            }
            catch (error) {
                const classification = classifyFailure(error);
                if (!classification.retryable || attempt === 2)
                    throw new FinalJobError(error, retryCount);
                retryCount += 1;
                await this.progress?.record(job.id, attempt + 1, 'retry_scheduled', { retry_count: retryCount }).catch(() => undefined);
                const delayMs = retryCount === 1 ? 1_000 : 3_000;
                this.logger.warn(`Job attempt failed id=${job.id} category=${classification.category}; retry ${retryCount}/2 in ${delayMs}ms`);
                await wait(delayMs);
            }
        }
        throw new FinalJobError(new Error('Job retry loop ended unexpectedly'), retryCount);
    }
    errorMessage(error) { return error instanceof Error ? error.message : 'Unknown error'; }
    isStopping() { return this.status === 'stopping'; }
}
//# sourceMappingURL=runner.js.map