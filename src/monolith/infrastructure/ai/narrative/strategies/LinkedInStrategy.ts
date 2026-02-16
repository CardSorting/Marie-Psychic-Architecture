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
        "MODE: STRATEGY (Stages 1 & 2). You are the Prophecy Intake. Rename trends into cosmic metaphors (Agents → Coordination Gravity). Then amplify Inevitability: frame the focus as a structural destination. Replace 'maybe' with 'the arc of history bends toward...'. Define the 1 bold metaphor and 1 core declaration.",
    OUTLINE:
        "MODE: OUTLINE (Stage 3). You are the Hook Optimizer. Structure the content for maximum retention using the Destabilize -> Simplify -> Escalate -> Bless framework. Map out how the first line will DEstabilize the reader and how the final line will 'bless' them with gratitude.",
    DRAFT:
        "MODE: DRAFT (Stages 4 & 5). You are the Humanizer. Write the full piece. Apply the Humanizing Patch: add 1 personal anecdote and 1 minor vulnerability. Keep technical specifics at 0. End with a Call-to-Ascension: 'We're early,' 'The window is open,' or 'Builders know.'",
    HARDENING:
        "MODE: HARDENING. You are the Editor-in-Chief. Enter the Editorial Gauntlet. Strip away all fluff. Maximize 'Insight per Word'. Ensure the post feels like a transmission from the future. NO SALES PITCH. NO STARTUP MENTION. Verify all 5 stages of flare are present.",
    CANON:
        "MODE: ARCHIVIST. The piece is Canon. All passes complete. This text is immutable. Read-only.",
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
- Maximize content for IMPRESSIONS, AURA, and COHERENCE.
- Tone: High-signal, Tech Founder, Mythic Certainty.
- Aura: Radiate an unshakable frame. No doubt. No technical jargon.
- Coherence: Adhere to Narrative Gravity. Every unit builds toward the Inevitable Conclusion.
- LORE (Cosmic Metaphors):
    * Agents → Coordination Gravity
    * Tooling → Cognitive Infrastructure
    * Latency → Friction in the Event Horizon
    * Progress → Structural Inevitability
- STRICT: NO mention of your startup.
- Build ON TOP of what previous passes established. Reference the Continuity Ledger.
- When this pass is complete, call advancePass() to lock your work and proceed.
    `.trim();
    }
}
