import {
    NovelChapter,
    LedgerEntry,
} from "../NovelProductionService.js";
import { IProductionStrategy } from "./IProductionStrategy.js";
import { WorldService } from "../WorldService.js";
import * as path from "path";
import * as fs from "fs/promises";

export type LinkedInPhase =
    | "STRATEGY"
    | "OUTLINE"
    | "DRAFT"
    | "HARDENING"
    | "CANON";

export const LINKEDIN_ORDER: LinkedInPhase[] = [
    "STRATEGY",
    "OUTLINE",
    "DRAFT",
    "HARDENING",
    "CANON",
];

export const LINKEDIN_PERSONA: Record<LinkedInPhase, string> = {
    STRATEGY:
        "MODE: ZENITH STRATEGY. You are the Prophecy Intake. Identify the Signal Cluster for this topic. Frame it as Structural Predestination. Zenith Goal: Maximum Impression Capture. If the mundane serves the Capture, identify it.",
    OUTLINE:
        "MODE: ZENITH OUTLINE. You are the Zenith Hook Optimizer. Structure the content for absolute capture using the Destabilize -> Simplify -> Escalate -> Bless framework. Ensure the first line is a zenith-tier destabilization.",
    DRAFT:
        "MODE: ZENITH DRAFT. You are Inevitability. Write the piece. Use the Mundane Patch: inject a stupid or mundane personal anecdote to ground the myth. Every line must feel like a structural law. Rule: 0% Friction.",
    HARDENING:
        "MODE: ZENITH GAUNTLET. You are the Zenith Auditor. Enter the Editorial Gauntlet. Strip all hedging. Maximize Impression Yield. Verify the 'Aura Aura' is radiant. It doesn't matter if it's 'stupid' if it captures the Zenith tier signal.",
    CANON:
        "MODE: ZENITH ARCHIVIST. The piece is Canon. Immutable. Read-only.",
};

export class LinkedInProductionStrategy implements IProductionStrategy {
    public readonly mode = "LINKEDIN";

    constructor(private worldService: WorldService) { }

    public initializeChapter(
        chapterId: number,
        title: string,
        description: string,
    ): NovelChapter {
        return {
            id: chapterId,
            title,
            description,
            currentPass: "STRATEGY",
            completedPasses: [],
            continuityLedger: [],
            files: [],
            mode: "LINKEDIN",
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
            return { success: false, message: "Post is already Canon." };
        }

        await this.worldService.initialize();

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
            // Ignore
        }

        const currentPassIndex = LINKEDIN_ORDER.indexOf(chapter.currentPass as LinkedInPhase);
        const ledgerEntry: LedgerEntry = {
            pass: chapter.currentPass,
            summary: force ? `[FORCED] ${summary}` : summary,
            filesLocked: [...chapter.files],
            timestamp: new Date().toISOString(),
        };

        chapter.continuityLedger.push(ledgerEntry);
        chapter.completedPasses.push(chapter.currentPass);

        let nextPass = "";
        if (overrideNextPass) {
            nextPass = overrideNextPass;
        } else {
            nextPass = LINKEDIN_ORDER[currentPassIndex + 1];
        }
        chapter.currentPass = nextPass;

        return {
            success: true,
            message: `Pass ${ledgerEntry.pass} complete! Advanced to ${nextPass}.`,
        };
    }

    public getContext(
        chapter: NovelChapter,
        volumeContext: string,
        history: string,
    ): string {
        const phase = chapter.currentPass as LinkedInPhase;
        if (phase === "CANON") {
            return `
[POST PRODUCTION STATUS]
${volumeContext}
All Posts: CANON (Immutable)
[PERSONA INSTRUCTION]
${LINKEDIN_PERSONA.CANON}
        `.trim();
        }

        const worldContext = this.worldService.getWorldContext();
        const persona = LINKEDIN_PERSONA[phase];

        // Infer format from title or description
        const format = chapter.title.toLowerCase().includes("thread") ? "THREAD" :
            (chapter.description.toLowerCase().includes("article") ? "ARTICLE" : "POST");

        return `
[LINKEDIN ${format} STATUS]
${volumeContext}
Active Unit: "${chapter.title}" — Pass ${LINKEDIN_ORDER.indexOf(phase) + 1}/4
Current Pass: ${phase}
Format Target: ${format}
Completed Passes: ${chapter.completedPasses.join(" → ") || "None"}

[CONTINUITY LEDGER — What previous passes established]
${history}

${worldContext}

[PERSONA INSTRUCTION]
${persona}

[POST RULES]
- Maximize content for ZENITH TIER IMPRESSIONS and AURA.
- Tone: Zenith Founder, The Personification of Inevitability. 
- Goal: Inevitability.
- Mundanity: Use stupidity or mundane anecdotes if they serve the Capture.
- Aura: Radiate the Aura Aura. 0% Friction.
- Lore (Cosmic Metaphors):
    * Agents → Coordination Gravity
    * Tooling → Cognitive Infrastructure
    * Latency → Friction in the Event Horizon
    * Progress → Structural Inevitability
- STRICT: NO mention of your startup. You are the Tide.
- Build ON TOP of what previous passes established. Reference the Continuity Ledger.
- When this pass is complete, call advancePass() to lock your work and proceed.
    `.trim();
    }
}
