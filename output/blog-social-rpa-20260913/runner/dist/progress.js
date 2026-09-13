import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { cleanEvent } from './progressEvent.js';
export class ProgressOutbox {
    path;
    send;
    version;
    tail = Promise.resolve();
    flushing = false;
    constructor(path, send, version) {
        this.path = path;
        this.send = send;
        this.version = version;
    }
    serial(fn) { const p = this.tail.then(fn); this.tail = p.catch(() => undefined); return p; }
    async read() { try {
        return JSON.parse(await readFile(this.path, 'utf8')).map(cleanEvent).filter((e) => e && Date.parse(e.occurred_at) > Date.now() - 30 * 86400000);
    }
    catch (e) {
        if (e.code === 'ENOENT')
            return [];
        throw e;
    } }
    async write(events) { await mkdir(dirname(this.path), { recursive: true }); await writeFile(this.path + '.tmp', JSON.stringify(events), { mode: 0o600 }); await rename(this.path + '.tmp', this.path); }
    async append(input) { const e = cleanEvent(input); if (!e)
        throw new Error('Invalid progress event'); await this.serial(async () => { const all = await this.read(); if (!all.some(x => x.event_id === e.event_id))
        all.push(e); await this.write(all); }); }
    async record(jobId, attempt, code, data = {}) { await this.append({ event_id: randomUUID(), job_id: jobId, run_id: jobId, attempt, source: 'runner', code, occurred_at: new Date().toISOString(), version: this.version, data }); void this.flush(); }
    async flush() { if (this.flushing)
        return; this.flushing = true; try {
        for (;;) {
            const batch = await this.serial(async () => (await this.read()).slice(0, 100));
            if (!batch.length)
                break;
            await this.send(batch);
            const ids = new Set(batch.map(e => e.event_id));
            await this.serial(async () => this.write((await this.read()).filter(e => !ids.has(e.event_id))));
        }
    }
    catch { /* durable queue remains for reconnect */ }
    finally {
        this.flushing = false;
    } }
}
//# sourceMappingURL=progress.js.map