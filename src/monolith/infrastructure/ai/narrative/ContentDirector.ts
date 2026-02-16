import * as fs from "fs/promises";
import * as path from "path";
import { MarieCLI } from "../../../adapters/CliMarieAdapter.js";
import { NovelProductionService, NovelChapter } from "./NovelProductionService.js";
import { WorldService } from "./WorldService.js";
import { EditorialService } from "./EditorialService.js";
import { Log } from "./ProductionLogger.js";
import { PassExecutor } from "./PassExecutor.js"; // Legacy for Novels
import { ContentPassExecutor } from "./ContentPassExecutor.js"; // New for Content
import { DraftingService } from "./DraftingService.js";
import { RevisionService } from "./RevisionService.js";
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
    private draftingService: DraftingService;
    private revisionService: RevisionService;
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
            this.workingDir,
            this.productionSvc.fs
        );

        this.draftingService = new DraftingService(this.marie, this.log, this.worldService);
        this.revisionService = new RevisionService(this.marie, this.log, this.editorialService);

        this.contentExecutor = new ContentPassExecutor(
            this.log,
            this.workingDir,
            this.productionSvc.fs,
            this.draftingService,
            this.revisionService
        );
    }

    public async registerStrategies() {
        // ...
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
                const active = this.findActiveChapter(mode);

                if (!active) {
                    process.stdout.write(`✅ No active ${mode} content found. Finished.\n`);
                    break;
                }

                const { ch, volId } = active;

                // 2. Execute
                if (mode === "NOVEL") {
                    await this.runNovelPass(ch, volId);
                } else {
                    await this.runContentPass(ch, volId);
                }

                await sleep(2000);
            } catch (e: any) {
                console.error(`Error: ${e.message}`);
                await sleep(5000);
            }
        }
    }

    private findActiveChapter(mode: ContentMode): { ch: NovelChapter, volId: number } | null {
        // @ts-ignore - Accessing private structure
        const structure = this.productionSvc.structure;
        // Search through all volumes
        for (const vol of structure.volumes) {
            const ch = vol.chapters.find((c: any) => {
                const chMode = c.mode || vol.mode || "NOVEL"; // defaulting
                return c.currentPass !== "FINAL" && c.currentPass !== "CANON" && chMode === mode;
            });
            if (ch) return { ch, volId: vol.id };
        }
        return null;
    }

    private async runContentPass(ch: NovelChapter, volId: number) {
        process.stdout.write(`\n📖 ${ch.mode}: "${ch.title}" | PASS: ${ch.currentPass}\n`);

        const result = await this.contentExecutor.execute(
            ch.currentPass as ContentPhase,
            volId,
            ch,
            "",
            this.rejectionFeedback
        );

        if (result.success && result.nextPass) {
            process.stdout.write(`   ✅ Complete. Next: ${result.nextPass}\n`);
            this.rejectionFeedback = null;
            await this.productionSvc.advancePass(
                ch,
                `Completed ${ch.currentPass}`,
                false,
                result.nextPass
            );
        } else if (!result.success) {
            process.stdout.write(`   ❌ Pass Failed. Retrying...\n`);
            this.rejectionFeedback = result.feedback;
        }
    }

    private async runNovelPass(ch: NovelChapter, volId: number) {
        const result = await this.novelExecutor.execute(
            ch.currentPass,
            volId,
            ch,
            "Summary...",
            this.rejectionFeedback
        );
        // ... handle result ...
        // Keeping it simple since NovelDirector typically handles this
    }
}
