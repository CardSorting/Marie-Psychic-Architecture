import { NarrativeFileSystem } from "./NarrativeFileSystem.js";
import { Log } from "./ProductionLogger.js";
import { NovelChapter } from "./NovelProductionService.js";
import { ContentPhase } from "./strategies/SimpleContentStrategy.js";
import * as path from "path";
import * as fs from "fs/promises";
import { readSafe } from "./ProductionUtils.js";
import { DraftingService } from "./DraftingService.js";
import { RevisionService } from "./RevisionService.js";

export class ContentPassExecutor {
    constructor(
        private log: Log,
        private workingDir: string,
        private fileSystem: NarrativeFileSystem,
        private draftingService: DraftingService,
        private revisionService: RevisionService
    ) { }

    public async execute(
        pass: ContentPhase,
        volumeId: number,
        ch: NovelChapter,
        prevSummary: string,
        rejectionFeedback?: any
    ): Promise<{ success: boolean; nextPass?: ContentPhase; feedback?: any }> {

        let targetDir: string;
        try {
            targetDir = await this.fileSystem.getChapterDirectory(volumeId, ch.id, ch.title);
        } catch (e) {
            const volDir = await this.fileSystem.getVolumeDirectory(volumeId);
            const chapDirName = this.fileSystem.formatFolderName(ch.id, ch.title);
            targetDir = path.join(volDir, chapDirName);
        }

        await fs.mkdir(targetDir, { recursive: true });

        const targetPath = path.join(targetDir, `content.md`);
        const conceptPath = path.join(targetDir, `concept.md`);
        const outlinePath = path.join(targetDir, `outline.md`);

        let success = false;
        let nextPass: ContentPhase | undefined;

        switch (pass) {
            case "CONCEPT":
                const concept = await this.draftingService.generateConcept(ch, rejectionFeedback);
                if (concept) {
                    await this.fileSystem.writeContent(conceptPath, concept);
                    success = true;
                    nextPass = "OUTLINE";
                }
                break;

            case "OUTLINE":
                const conceptContent = await readSafe(conceptPath);
                const outline = await this.draftingService.generateOutline(ch, conceptContent);
                if (outline) {
                    await this.fileSystem.writeContent(outlinePath, outline);
                    success = true;
                    nextPass = "DRAFT";
                }
                break;

            case "DRAFT":
                const outlineContent = await readSafe(outlinePath);
                const draft = await this.draftingService.generateDraft(ch, outlineContent);
                if (draft) {
                    await this.fileSystem.writeContent(targetPath, draft);
                    success = true;
                    nextPass = "REVIEW";
                }
                break;

            case "REVIEW":
                const draftForReview = await readSafe(targetPath);
                const decision = await this.revisionService.reviewDraft(ch, draftForReview);

                if (decision.outcome === "APPROVE") {
                    process.stdout.write(`   ✅ Draft Approved (${decision.averageScore}/10).\n`);
                    success = true;
                    nextPass = "POLISH";
                } else if (decision.strategy === "PROSE_FIX") {
                    process.stdout.write(`   ⚠️  Draft Needs Polish. Applying fixes...\n`);
                    const fixed = await this.revisionService.applyFix(ch, draftForReview, decision.consolidatedFeedback);
                    if (fixed) {
                        await this.fileSystem.writeContent(targetPath, fixed);
                        success = true;
                        // Stay in review? Or move to polish? 
                        // Implementation plan says "move to POLISH" if success=true, but traditionally we might re-review. 
                        // Taking the "Forward Momentum" approach: Fix -> Polish.
                        nextPass = "POLISH";
                    } else {
                        return { success: false, feedback: decision };
                    }
                } else {
                    process.stdout.write(`   🛑 Draft Rejected. Strategy: ${decision.strategy}\n`);
                    return { success: false, feedback: decision };
                }
                break;

            case "POLISH":
                const draftForPolish = await readSafe(targetPath);
                const polished = await this.revisionService.polishDraft(ch, draftForPolish);
                if (polished) {
                    await this.fileSystem.writeContent(targetPath, polished);
                    success = true;
                    nextPass = "FINAL";
                }
                break;

            case "FINAL":
                success = true;
                break;
        }

        return { success, nextPass };
    }
}
