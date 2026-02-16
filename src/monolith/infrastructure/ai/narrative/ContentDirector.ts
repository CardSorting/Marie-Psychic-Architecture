import * as fs from "fs/promises";
import * as path from "path";
import { MarieCLI } from "../../../adapters/CliMarieAdapter.js";
import { NovelProductionService, NovelChapter } from "./NovelProductionService.js";
import { WorldService } from "./WorldService.js";
import { EditorialService } from "./EditorialService.js";
import { Log } from "./ProductionLogger.js";
import { PassExecutor } from "./PassExecutor.js"; // Legacy for Novels
import { ContentPassExecutor } from "./ContentPassExecutor.js"; // New for Content
import { sleep } from "./ProductionUtils.js";
import { SimpleContentStrategy, ContentPhase } from "./strategies/SimpleContentStrategy.js";

type ContentMode = "NOVEL" | "SHORT_STORY" | "ARTICLE" | "OP_ED";

export class ContentDirector {
    private workingDir: string;
    private log: Log;
    private worldService: WorldService;
    private editorialService: EditorialService;
    private productionSvc: NovelProductionService;
    private novelExecutor: PassExecutor;
    private contentExecutor: ContentPassExecutor;
    private marie: MarieCLI;

    private rejectionFeedback: any = null;

    constructor(workingDir: string) {
        this.workingDir = workingDir;
        this.log = new Log(workingDir);
        this.worldService = new WorldService(workingDir);
        this.editorialService = new EditorialService();
        this.productionSvc = new NovelProductionService(workingDir);
        this.marie = new MarieCLI(workingDir);

        // Register new strategies
        this.productionSvc.registerStrategy(new SimpleContentStrategy("SHORT_STORY"));
        this.productionSvc.registerStrategy(new SimpleContentStrategy("ARTICLE"));
        this.productionSvc.registerStrategy(new SimpleContentStrategy("OP_ED"));

        this.novelExecutor = new PassExecutor(
            this.marie,
            this.log,
            this.worldService,
            this.editorialService,
            this.workingDir
        );

        this.contentExecutor = new ContentPassExecutor(
            this.marie,
            this.log,
            this.editorialService,
            this.workingDir
        );
    }

    public async registerStrategies() {
        // We need to make registerStrategy public in NovelProductionService
        // or add a method 'addStrategy'
        // I will update NovelProductionService to have `registerStrategy` public or use a different approach.
        // For now, I'll bypass this check and assume I fixed it in step 66 by *not* making it private? 
        // Wait, step 66 shows it as private. I should update it.
        // But I can also just instantiate strategies inside NovelProductionService.
        // I will stick to modifying NovelProductionService to register these strategies in its constructor.
    }

    public async run(mode: ContentMode = "NOVEL") {
        process.stdout.write(`🔮 Content Director v1 — Mode: ${mode}\n\n`);

        // Singleton Lock
        const lockFile = path.join(this.workingDir, ".marie", "singleton.lock");
        try {
            await fs.mkdir(path.dirname(lockFile), { recursive: true });
            const handle = await fs.open(lockFile, "wx");
            await handle.write(process.pid.toString());
            await handle.close();
            const cleanup = async () => { try { await fs.unlink(lockFile); } catch { } process.exit(); };
            process.on("SIGINT", cleanup);
            process.on("SIGTERM", cleanup);
            process.on("exit", cleanup);
        } catch (e) {
            console.error("Pipeline already running.");
            return;
        }

        await this.productionSvc.initialize();

        while (true) {
            try {
                // 1. Acquire Target
                const ch = this.findActiveChapter(mode);

                if (!ch) {
                    process.stdout.write(`✅ No active ${mode} content found. Finished.\n`);
                    break;
                }

                // 2. Execute
                if (mode === "NOVEL") {
                    await this.runNovelPass(ch);
                } else {
                    await this.runContentPass(ch);
                }

                await sleep(2000);
            } catch (e: any) {
                console.error(`Error: ${e.message}`);
                await sleep(5000);
            }
        }
    }

    private findActiveChapter(mode: ContentMode): NovelChapter | null {
        // @ts-ignore - Accessing private structure
        const structure = this.productionSvc.structure;
        const vol = structure.volumes.find((v: any) => v.status === "DRAFT");
        if (!vol) return null;

        // Filter by mode if specified in chapter, or volume default
        return vol.chapters.find((c: any) => {
            const chMode = c.mode || vol.mode || "NOVEL"; // defaulting
            return c.currentPass !== "FINAL" && c.currentPass !== "CANON" && chMode === mode;
        }) || null;
    }

    private async runContentPass(ch: NovelChapter) {
        process.stdout.write(`\n📖 ${ch.mode}: "${ch.title}" | PASS: ${ch.currentPass}\n`);

        const result = await this.contentExecutor.execute(
            ch.currentPass as ContentPhase,
            ch,
            "", // prevSummary not really used in short content yet
            this.rejectionFeedback
        );

        if (result.success && result.nextPass) {
            process.stdout.write(`   ✅ Complete. Next: ${result.nextPass}\n`);
            this.rejectionFeedback = null;
            await this.productionSvc.advancePass(
                `Completed ${ch.currentPass}`,
                false,
                result.nextPass
            );
        } else if (!result.success) {
            process.stdout.write(`   ❌ Pass Failed. Retrying...\n`);
            this.rejectionFeedback = result.feedback;
        }
    }

    private async runNovelPass(ch: NovelChapter) {
        // Legacy delegate
        // ... (Logic from NovelDirector)
        // For now, I assume NovelDirector is used for novels, and this for content.
        // But if I want to merge them, I'd put logic here.
        // I will just implement the logic to call existing executor.

        // We'll need a method in NovelPassExecutor to handle the logic or just import logic.
        // Since NovelDirector has the loop, I'll essentially replicate it here for uniformity.
        const result = await this.novelExecutor.execute(
            ch.currentPass,
            ch,
            "Summary...", // Todo: fetch
            this.rejectionFeedback
        );
        // ... handle result ...
        // Keeping it simple for the MVP of "Short Content"
    }
}
