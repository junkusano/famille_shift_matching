import { cleanEvent } from './progressEvent.js';
import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
export class ExtensionBridgeError extends Error {
    code;
    constructor(message, code = 'EXTENSION_BRIDGE_ERROR') {
        super(message);
        this.code = code;
        this.name = 'ExtensionBridgeError';
    }
}
function json(response, status, body) { response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); response.end(JSON.stringify(body)); }
async function readBody(request) { const chunks = []; for await (const chunk of request)
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)); if (Buffer.concat(chunks).length > 1_000_000)
    throw new Error('Request too large'); return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
function isRecord(value) { return typeof value === 'object' && value !== null && !Array.isArray(value); }
export class ExtensionBridge {
    port;
    token;
    progress;
    pending = new Map();
    sequence = 0;
    server = createServer((request, response) => void this.handle(request, response));
    constructor(port, token, progress) {
        this.port = port;
        this.token = token;
        this.progress = progress;
    }
    async start() { await new Promise((resolve, reject) => { this.server.once('error', reject); this.server.listen(this.port, '127.0.0.1', () => { this.server.off('error', reject); resolve(); }); }); }
    async stop() { for (const command of this.pending.values())
        command.reject(new ExtensionBridgeError('Runner is stopping', 'RUNNER_STOPPING')); this.pending.clear(); await new Promise((resolve, reject) => this.server.close((error) => error ? reject(error) : resolve())); }
    async execute(job, signal) {
        if (signal.aborted)
            throw new ExtensionBridgeError('Job aborted', 'JOB_ABORTED');
        const id = `${job.id}:${++this.sequence}`;
        await this.progress?.record(job.id, job.attempt ?? 1, 'extension_requested').catch(() => undefined);
        return new Promise((resolve, reject) => {
            const onAbort = () => { this.pending.delete(id); reject(new ExtensionBridgeError('Job aborted', 'JOB_ABORTED')); };
            signal.addEventListener('abort', onAbort, { once: true });
            this.pending.set(id, { id, job, resolve: (result) => { signal.removeEventListener('abort', onAbort); resolve(result); }, reject: (error) => { signal.removeEventListener('abort', onAbort); reject(error); } });
        });
    }
    authorized(request) { const provided = request.headers['x-famille-rpa-extension-token']; if (typeof provided !== 'string')
        return false; const actual = Buffer.from(provided); const expected = Buffer.from(this.token); return actual.length === expected.length && timingSafeEqual(actual, expected); }
    async handle(request, response) {
        if (!this.authorized(request)) {
            json(response, 401, { ok: false, error: 'Unauthorized' });
            return;
        }
        if (request.method === 'GET' && request.url === '/health') {
            json(response, 200, { ok: true });
            return;
        }
        if (request.method === 'GET' && request.url === '/jobs/next') {
            const command = this.pending.values().next().value;
            json(response, 200, { ok: true, command: command ? { id: command.id, job: command.job } : null });
            return;
        }
        if (request.method === 'POST' && request.url === '/events') {
            try {
                const body = await readBody(request);
                if (!isRecord(body) || !Array.isArray(body.events) || body.events.length > 100 || !this.progress)
                    throw new Error('Invalid events');
                for (const raw of body.events) {
                    const e = cleanEvent(raw);
                    if (!e || e.source !== 'extension' || !e.job_id)
                        throw new Error('Invalid event');
                    await this.progress.append(e);
                }
                void this.progress.flush();
                json(response, 200, { ok: true });
            }
            catch {
                json(response, 400, { ok: false, error: 'Progress not stored' });
            }
            return;
        }
        const resultMatch = request.url?.match(/^\/jobs\/([^/]+)\/result$/);
        if (request.method === 'POST' && resultMatch && resultMatch[1]) {
            const command = this.pending.get(decodeURIComponent(resultMatch[1]));
            if (!command) {
                json(response, 404, { ok: false, error: 'Command not found' });
                return;
            }
            try {
                const payload = await readBody(request);
                if (!isRecord(payload) || typeof payload.ok !== 'boolean')
                    throw new Error('Invalid result');
                this.pending.delete(command.id);
                if (payload.ok && isRecord(payload.result))
                    command.resolve(payload.result);
                else
                    command.reject(new ExtensionBridgeError(typeof payload.error_message === 'string' ? payload.error_message : 'Extension job failed', typeof payload.error_code === 'string' ? payload.error_code : 'EXTENSION_JOB_FAILED'));
                json(response, 200, { ok: true });
            }
            catch {
                json(response, 400, { ok: false, error: 'Invalid result body' });
            }
            return;
        }
        json(response, 404, { ok: false, error: 'Not found' });
    }
}
//# sourceMappingURL=extensionBridge.js.map