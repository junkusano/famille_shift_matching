export class ConsoleLogger {
    log(level, message) {
        console.log(`[${new Date().toISOString()}] [${level}] ${message}`);
    }
    info(message) { this.log('INFO', message); }
    warn(message) { this.log('WARN', message); }
    error(message) { this.log('ERROR', message); }
}
//# sourceMappingURL=logger.js.map