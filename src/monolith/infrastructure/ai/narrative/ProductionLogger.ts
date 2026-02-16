import * as fs from "node:fs";
import * as path from "node:path";

export class Log {
    private stream: fs.WriteStream | null = null;
    private logPath: string;

    constructor(workingDir: string) {
        this.logPath = path.join(workingDir, ".vault", "novel", "production.log");
        this.ensureStreamOpen();
    }

    private ensureStreamOpen() {
        if (this.stream) return;
        try {
            const dir = path.dirname(this.logPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            this.stream = fs.createWriteStream(this.logPath, { flags: "a" });
            this.stream.on("error", (err) => {
                process.stderr.write(`\n❌ LOG STREAM ERROR: ${err.message}\n`);
            });
        } catch (err: any) {
            process.stderr.write(`\n❌ CRITICAL: Failed to open log file: ${err.message}\n`);
        }
    }

    async write(ch: number, pass: string, msg: string, words?: number) {
        const ts = new Date().toISOString().substring(11, 19);
        const wc = words !== undefined ? ` [${words}w]` : "";
        const line = `[${ts}] Ch${ch}/${pass}: ${msg}${wc}\n`;
        
        // Non-blocking stdout
        process.stdout.write(`📝 ${line}`, () => {}); 

        this.ensureStreamOpen();
        if (this.stream) {
            this.stream.write(line);
        }
    }

    close() {
        if (this.stream) {
            this.stream.end();
            this.stream = null;
        }
    }
}
