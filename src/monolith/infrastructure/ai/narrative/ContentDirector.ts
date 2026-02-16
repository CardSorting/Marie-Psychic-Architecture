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
import { sleep, Semaphore } from "./ProductionUtils.js";
import { SimpleContentStrategy, ContentPhase } from "./strategies/SimpleContentStrategy.js";
import { MusicStudioProductionStrategy } from "./strategies/MusicStudioStrategy.js";

type ContentMode = "NOVEL" | "SHORT_STORY" | "ARTICLE" | "OP_ED" | "MUSIC_STUDIO";

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
    
    // 🚦 Concurrency Control: Limit to 10 simultaneous active chapters
    private semaphore = new Semaphore(10);

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
        this.productionSvc.registerStrategy(new MusicStudioProductionStrategy(this.worldService));

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

    public async run(mode: ContentMode = "NOVEL") {
        process.stdout.write(`🔮 Hyper-Parallel Content Director — Mode: ${mode}\n\n`);

        // Singleton Lock
        const lockFile = path.join(this.workingDir, ".marie", "singleton.lock");
        try {
            await fs.mkdir(path.dirname(lockFile), { recursive: true });
            const handle = await fs.open(lockFile, "wx");
            await handle.write(process.pid.toString());
            await handle.close();
            const cleanup = async () => { try { await fs.unlink(lockFile); } catch { } process.exit(); };
            process.on("SIGINT", cleanup); process.on("SIGTERM", cleanup); process.on("exit", cleanup);
        } catch (e) {
            console.error("Pipeline already running.");
            return;
        }

        await this.productionSvc.initialize();

        while (true) {
            try {
                // 1. Acquire ALL Active Targets across ALL Volumes
                const activeItems = this.findAllActiveChapters(mode);

                if (activeItems.length === 0) {
                    process.stdout.write(`✅ No active ${mode} content found. Task complete.\n`);
                    break;
                }

                process.stdout.write(`🚀 Burst Mode: Orchestrating ${activeItems.length} items (Concurrency Cap: 10)...\n`);

                // 2. Execute Batch through Semaphore
                await Promise.all(activeItems.map((item) => 
                    this.semaphore.run(async () => {
                        const { ch, volId } = item;
                        try {
                            if (mode === "NOVEL") {
                                await this.runNovelPass(ch, volId);
                            } else {
                                await this.runContentPass(ch, volId);
                            }
                        } catch (err: any) {
                            process.stderr.write(`   [FAIL] ${ch.title}: ${err.message}\n`);
                        }
                    })
                ));

                // ⚡ Yield to event loop
                await sleep(100); 
                await this.productionSvc.initialize(); 
            } catch (e: any) {
                console.error(`Loop Error: ${e.message}`);
                await sleep(2000); 
            }
        }
    }

    private findAllActiveChapters(mode: ContentMode): { ch: NovelChapter, volId: number }[] {
        // @ts-ignore - Accessing private structure
        const structure = this.productionSvc.structure;
        const active: { ch: NovelChapter, volId: number }[] = [];
        
        for (const vol of structure.volumes) {
            if (vol.status !== "DRAFT") continue;
            
            const chapters = vol.chapters.filter((c: any) => {
                const chMode = c.mode || vol.mode || "NOVEL";
                if (c.currentPass === "FINAL" || c.currentPass === "CANON") return false;
                if (chMode !== mode) return false;
                if (c.scheduledDate && new Date(c.scheduledDate) > new Date()) return false;
                return true;
            });
            for (const ch of chapters) active.push({ ch, volId: vol.id });
        }
        return active;
    }

    private async runContentPass(ch: NovelChapter, volId: number) {
        process.stdout.write(`   ⚡ Active Task: ${ch.mode} | "${ch.title}" | PASS: ${ch.currentPass}\n`);

        const result = await this.contentExecutor.execute(
            ch.currentPass as ContentPhase,
            volId,
            ch,
            "",
            this.rejectionFeedback
        );

        if (result.success && result.nextPass) {
            process.stdout.write(`   ✅ Complete: "${ch.title}" -> Next: ${result.nextPass}\n`);
            this.rejectionFeedback = null;
            await this.productionSvc.advancePass(ch, `Hyper-Parallel: Completed ${ch.currentPass}`, false, result.nextPass);
        } else if (!result.success) {
            process.stdout.write(`   ❌ Failed: "${ch.title}" (Pass: ${ch.currentPass})\n`);
            this.rejectionFeedback = result.feedback;
        }
    }

    private async runNovelPass(ch: NovelChapter, volId: number) {
        const result = await this.novelExecutor.execute(ch.currentPass, volId, ch, "Batch summary", this.rejectionFeedback);
    }
}
