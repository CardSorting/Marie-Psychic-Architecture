import * as fs from "fs/promises";
import * as path from "path";
import { MarieCLI } from "../../../adapters/CliMarieAdapter.js";
import { NovelProductionService } from "./NovelProductionService.js";
import { WorldService } from "./WorldService.js";
import { EditorialService } from "./EditorialService.js";
import { Log } from "./ProductionLogger.js";
import { PassExecutor } from "./PassExecutor.js";
import { sleep } from "./ProductionUtils.js";

export class NovelDirector {
    private workingDir: string;
    private log: Log;
    private worldService: WorldService;
    private editorialService: EditorialService;
    private productionSvc: NovelProductionService;
    private executor: PassExecutor;
    private marie: MarieCLI;

    // Ouroboros State
    private rejectionFeedback: any = null;

    constructor(workingDir: string) {
        this.workingDir = workingDir;
        this.log = new Log(workingDir);
        this.worldService = new WorldService(workingDir);
        this.editorialService = new EditorialService();
        this.productionSvc = new NovelProductionService(workingDir);
        this.marie = new MarieCLI(workingDir);

        this.executor = new PassExecutor(
            this.marie,
            this.log,
            this.worldService,
            this.editorialService,
            this.workingDir,
            this.productionSvc.fs
        );
    }

    public async run() {
        process.stdout.write("🔮 Novel Pipeline v10 — THE SOVEREIGN DIRECTOR\n\n");

        // ─── SINGLETON LOCK ───
        const lockFile = path.join(this.workingDir, ".marie", "singleton.lock");
        try {
            await fs.mkdir(path.dirname(lockFile), { recursive: true });
            const handle = await fs.open(lockFile, "wx");
            await handle.write(process.pid.toString());
            await handle.close();

            // Clean up on exit
            const cleanup = async () => {
                try { await fs.unlink(lockFile); } catch { }
                process.exit();
            };
            process.on("SIGINT", cleanup);
            process.on("SIGTERM", cleanup);
            process.on("exit", cleanup);
        } catch (e) {
            process.stderr.write(`\n❌ FATAL: Another instance of the pipeline is already running (or lockfile exists at ${lockFile}).\n`);
            process.stderr.write(`   If you are sure no other instance is active, delete the lockfile and try again.\n`);
            return;
        }

        process.stdout.write("✅ MarieCLI initialized.\n");

        await this.worldService.initialize();

        while (true) {
            try {
                // Refresh State
                await this.productionSvc.initialize();

                // 1. Acquire Target
                const active = this.findActiveChapter();
                if (!active) {
                    process.stdout.write("✅ No active chapters found. Pipeline sleeping.\n");
                    break;
                }
                const { ch, volId } = active;

                // 2. Context Retrieval
                const prevSummary = await this.getPreviousSummary(ch.id);

                process.stdout.write(`\n📖 Ch${ch.id}: "${ch.title}" | PASS: ${ch.currentPass} ${this.rejectionFeedback ? "↺ (RETRYING)" : ""}\n`);

                // 3. Execute Pass
                const result = await this.executor.execute(
                    ch.currentPass,
                    volId,
                    ch,
                    prevSummary,
                    this.rejectionFeedback
                );

                // 4. Handle Result
                if (result.success && result.nextPass) {
                    process.stdout.write(`   ✅ Complete. Next: ${result.nextPass}\n`);
                    this.rejectionFeedback = null; // Clear feedback
                    await this.productionSvc.advancePass(
                        ch,
                        `Completed ${ch.currentPass}`,
                        false,
                        // @ts-ignore
                        result.nextPass
                    );
                } else if (!result.success && ch.currentPass === "RECEPTION") {
                    // 5. Ouroboros Recursion
                    process.stdout.write("   ❌ REJECTED BY CRITICS CIRCLE. REVERTING TO BLUEPRINT.\n");
                    this.rejectionFeedback = result.feedback;
                    await this.productionSvc.regressToBlueprint(ch.id);
                } else {
                    process.stdout.write("   ⚠️ Pass Failed. Retrying...\n");
                    await sleep(5000);
                }

                await sleep(2000);

            } catch (e: any) {
                process.stdout.write(`   🛑 ERROR: ${e.message}\n`);
                await sleep(5000);
            }
        }
    }

    private findActiveChapter(): { ch: any, volId: number } | null {
        // Access private structure via any casting hack
        const structure = (this.productionSvc as any).structure;
        if (!structure || !structure.volumes) return null;

        const vol = structure.volumes.find((v: any) => v.status === "DRAFT");
        if (!vol) return null;

        const ch = vol.chapters.find((c: any) => c.currentPass !== "CANON");
        return ch ? { ch, volId: vol.id } : null;
    }

    private async getPreviousSummary(currentChId: number): Promise<string> {
        if (currentChId <= 1) return "Start of Volume.";

        // Try to find previous chapter file
        try {
            const chapDir = path.join(this.workingDir, ".vault", "novel", "chapters");
            const files = await fs.readdir(chapDir);
            const prevFile = files.find(f => f.startsWith(`Chapter_${currentChId - 1}_`));

            if (prevFile) {
                const txt = await fs.readFile(path.join(chapDir, prevFile), "utf-8");
                return "..." + txt.slice(-800);
            }
        } catch (e) {
            // Ignore
        }
        return "Start of Volume.";
    }
}
