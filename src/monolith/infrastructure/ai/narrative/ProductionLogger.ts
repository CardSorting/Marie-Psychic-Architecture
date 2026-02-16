import * as fsSync from "node:fs";
import * as path from "node:path";

export class Log {
    private logFd: number | null = null;
    private logPath: string;

    constructor(workingDir: string) {
        this.logPath = path.join(workingDir, ".vault", "novel", "production.log");
        this.ensureLogOpen();
    }

    private ensureLogOpen() {
        if (this.logFd !== null) return;
        try {
            const dir = path.dirname(this.logPath);
            if (!fsSync.existsSync(dir)) {
                fsSync.mkdirSync(dir, { recursive: true });
            }
            this.logFd = fsSync.openSync(this.logPath, "a");
        } catch (err: any) {
            process.stderr.write(`\n❌ CRITICAL: Failed to open log file: ${err.message}\n`);
        }
    }

    async write(ch: number, pass: string, msg: string, words?: number) {
        const ts = new Date().toISOString().substring(11, 19);
        const wc = words !== undefined ? ` [${words}w]` : "";
        const line = `[${ts}] Ch${ch}/${pass}: ${msg}${wc}\n`;
        process.stdout.write(`📝 ${line}`);

        this.ensureLogOpen();
        if (this.logFd !== null) {
            try {
                fsSync.writeSync(this.logFd, line);
                fsSync.fsyncSync(this.logFd);
            } catch (err: any) {
                process.stderr.write(`\n❌ Log Write Failed: ${err.message}\n`);
                this.logFd = null;
            }
        }
    }

    close() {
        if (this.logFd !== null) {
            try {
                fsSync.closeSync(this.logFd);
                this.logFd = null;
            } catch { }
        }
    }
}
