import {
    NovelChapter,
    PASS_PERSONA,
    PASS_ZONE_MAP,
    PASS_ORDER,
    PassPhase,
    LedgerEntry,
} from "../NovelProductionService.js";
import { IProductionStrategy } from "./IProductionStrategy.js";
import { CritiqueService } from "../CritiqueService.js";
import * as path from "path";
import * as fs from "fs/promises";

export class EssayProductionStrategy implements IProductionStrategy {
    public readonly mode = "ESSAY";
    private critiqueService: CritiqueService;

    constructor() {
        this.critiqueService = new CritiqueService();
    }

    public initializeChapter(
        chapterId: number,
        title: string,
        description: string,
    ): NovelChapter {
        return {
            id: chapterId,
            title,
            description,
            currentPass: "SKELETON",
            completedPasses: [],
            continuityLedger: [],
            files: [],
            mode: "ESSAY",
        };
    }

    public async advancePass(
        chapter: NovelChapter,
        rootPath: string,
        summary: string,
        force: boolean,
        overrideNextPass?: string,
    ): Promise<{ success: boolean; message: string }> {
        if (chapter.currentPass === "CANON") {
            return { success: false, message: "Chapter is already Canon." };
        }

        // AUTO-DISCOVERY: Scan for files belonging to this chapter
        const vaultPath = path.join(rootPath, ".vault", "novel", "chapters");
        try {
            const files = await fs.readdir(vaultPath);
            const chapterFiles = files.filter(
                (f) => f.startsWith(`Chapter_${chapter.id}_`) && f.endsWith(".md"),
            );
            if (chapterFiles.length > 0) {
                chapter.files = chapterFiles.map((f) =>
                    path.join(".vault", "novel", "chapters", f),
                );
            }
        } catch (e) {
            // Ignore if directory doesn't exist
        }

        let reviewScore = 100;
        let reviewCritique = "Forced advancement (bypassed editor).";

        if (!force) {
            const review = await this.critiqueService.reviewPass(
                chapter,
                chapter.currentPass as PassPhase,
                rootPath,
            );
            reviewScore = review.score;
            reviewCritique = review.critique;

            if (!review.approved) {
                return {
                    success: false,
                    message: `Pass ${chapter.currentPass} REJECTED. Score: ${review.score}. ${review.critique}`,
                };
            }
        }

        const currentPassIndex = PASS_ORDER.indexOf(chapter.currentPass as PassPhase);
        const ledgerEntry: LedgerEntry = {
            pass: chapter.currentPass as PassPhase,
            summary: force ? `[FORCED] ${summary}` : summary,
            filesLocked: [...chapter.files],
            timestamp: new Date().toISOString(),
        };

        chapter.continuityLedger.push(ledgerEntry);
        chapter.completedPasses.push(chapter.currentPass as PassPhase);

        let nextPass = "";
        if (overrideNextPass) {
            nextPass = overrideNextPass;
        } else {
            nextPass = PASS_ORDER[currentPassIndex + 1];
        }
        chapter.currentPass = nextPass;

        return {
            success: true,
            message: `Pass ${ledgerEntry.pass} complete! Score: ${reviewScore}. Advanced to ${nextPass}. ${reviewCritique}`,
        };
    }

    public getContext(
        chapter: NovelChapter,
        volumeContext: string,
        history: string,
    ): string {
        if (chapter.currentPass === "CANON") {
            return `
[NOVEL PRODUCTION STATUS]
${volumeContext}
All Chapters: CANON (Immutable)
[PERSONA INSTRUCTION]
${PASS_PERSONA.CANON}
        `.trim();
        }

        const persona = PASS_PERSONA[chapter.currentPass as PassPhase];
        const allowedZone = PASS_ZONE_MAP[chapter.currentPass as Exclude<PassPhase, "CANON">];

        return `
[NOVEL PRODUCTION STATUS]
${volumeContext}
Active Chapter: "${chapter.title}" — Pass ${PASS_ORDER.indexOf(chapter.currentPass as PassPhase) + 1}/5
Current Pass: ${chapter.currentPass}
Allowed Zone: ${allowedZone} (ONLY modify files in this zone)
Completed Passes: ${chapter.completedPasses.join(" → ") || "None"}

[CONTINUITY LEDGER — What previous passes established]
${history}

[PERSONA INSTRUCTION]
${persona}

[PASS RULES]
- You may ONLY create/modify files that belong to the "${allowedZone}" zone.
- Files from completed passes are SEMI-CANON (read-only). Do not modify them.
- Build ON TOP of what previous passes established. Reference the Continuity Ledger.
- When this pass is complete, call advancePass() to lock your work and proceed.
    `.trim();
    }
}
