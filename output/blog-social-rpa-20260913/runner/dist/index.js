import { ProgressOutbox } from './progress.js';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { MyFamilleClient } from './api/myFamilleClient.js';
import { loadConfig } from './config.js';
import { ConsoleLogger } from './logger.js';
import { Runner } from './runner.js';
import { ExtensionBridge } from './extensionBridge.js';
import { createJobHandlers } from './jobs/executeJob.js';
async function main() {
    const config = loadConfig();
    const logger = new ConsoleLogger();
    const client = new MyFamilleClient(config);
    const progress = new ProgressOutbox(join(process.env.LOCALAPPDATA || homedir(), 'FamilleRpaRunner', config.runnerId, 'progress-outbox.json'), events => client.sendProgress(events), config.runnerVersion);
    void progress.flush();
    const bridge = config.extensionToken ? new ExtensionBridge(config.extensionPort, config.extensionToken, progress) : undefined;
    if (bridge) {
        await bridge.start();
        logger.info("Chrome extension bridge listening on 127.0.0.1:");
    }
    else
        logger.warn('RPA_EXTENSION_TOKEN is not configured; Chrome extension jobs will fail safely');
    const runner = new Runner(config, client, logger, createJobHandlers(bridge), progress);
    const shutdown = (signal) => {
        logger.info(`Shutdown requested (${signal})`);
        void runner.stop();
    };
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    await runner.start();
    if (bridge)
        await bridge.stop();
}
main().catch((error) => {
    const message = error instanceof Error ? error.message : 'Unknown startup error';
    console.error(`[${new Date().toISOString()}] [ERROR] Runner could not start: ${message}`);
    process.exitCode = 1;
});
//# sourceMappingURL=index.js.map