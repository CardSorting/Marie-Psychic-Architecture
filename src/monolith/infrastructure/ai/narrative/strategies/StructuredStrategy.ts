import {
    NovelChapter,
    LedgerEntry,
} from "../NovelProductionService.js";
import { IProductionStrategy } from "./IProductionStrategy.js";
import { WorldService } from "../WorldService.js";
import * as path from "path";
import * as fs from "fs/promises";

export type StructuredPhase =
    | "SIMULATION"
    | "FOUNDATION"
    | "BEATS"
    | "DRAFT"
    | "COHESION"
    | "CANON";

export const STRUCTURED_ORDER: StructuredPhase[] = [
    "SIMULATION",
    "FOUNDATION",
    "BEATS",
    "DRAFT",
    "COHESION",
    "CANON",
];

export const STRUCTURED_PERSONA: Record<StructuredPhase, string> = {
    SIMULATION:
        "MODE: SIMULATION. You are the Dungeon Master. Review the 'Active Factions' and their goals. Based on previous events, simulate their off-screen actions. Output a JSON 'worldDelta' with updates to their state, resources, or new events/relationships. Do NOT write prose.",
    FOUNDATION:
        "MODE: FOUNDATION. You are the World Architect. Establish the constraints, world state, and narrative arc for this chapter. Output a JSON object with: { worldState: string, narrativeArc: string, constraints: string[], worldDelta: WorldDelta }. The 'worldDelta' should include any NEW entities or events you are introducing.",
    BEATS:
        "MODE: BEATS. You are the Scene Director. Create a detailed beat sheet for the chapter. Each beat must advance the plot and reveal character. Ensure strict adherence to the Foundation and World Bible.",
    DRAFT:
        "MODE: DRAFT. You are the Storyteller. Write the full chapter prose. Focus on flow, voice, and immersion. Adhere strictly to the Beat Sheet.",
    COHESION:
        "MODE: COHESION. You are the Editor-in-Chief. Review the composition against the World Bible and previous chapters. Fix continuity errors. You have access to 'check_world_consistency' tool.",
    CANON:
        "MODE: ARCHIVIST. The chapter is Canon. All passes complete. This text is immutable. Read-only.",
};

export class StructuredProductionStrategy implements IProductionStrategy {
    public readonly mode = "STRUCTURED";

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
            currentPass: "SIMULATION",
            completedPasses: [],
            continuityLedger: [],
            files: [],
            mode: "STRUCTURED",
        };
    }

    public async advancePass(
        chapter: NovelChapter,
        rootPath: string,
        summary: string,
        force: boolean,
    ): Promise<{ success: boolean; message: string }> {
        if (chapter.currentPass === "CANON") {
            return { success: false, message: "Chapter is already Canon." };
        }

        // Initialize world service if not already
        await this.worldService.initialize();

        // AUTO-DISCOVERY specific to structured mode if needed
        // For now, assume similar file structure or adapt as needed
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

        const currentPassIndex = STRUCTURED_ORDER.indexOf(chapter.currentPass as StructuredPhase);
        const ledgerEntry: LedgerEntry = {
            pass: chapter.currentPass, // In a real system, might want to unite PassPhase types
            summary: force ? `[FORCED] ${summary}` : summary,
            filesLocked: [...chapter.files],
            timestamp: new Date().toISOString(),
        };

        chapter.continuityLedger.push(ledgerEntry);
        chapter.completedPasses.push(chapter.currentPass);

        const nextPass = STRUCTURED_ORDER[currentPassIndex + 1];
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
        const phase = chapter.currentPass as StructuredPhase;
        if (phase === "CANON") {
            return `
[NOVEL PRODUCTION STATUS]
${volumeContext}
All Chapters: CANON (Immutable)
[PERSONA INSTRUCTION]
${STRUCTURED_PERSONA.CANON}
        `.trim();
        }

        // Inject World Context
        const worldContext = this.worldService.getWorldContext();

        const persona = STRUCTURED_PERSONA[phase];

        return `
[NOVEL PRODUCTION STATUS]
${volumeContext}
Active Chapter: "${chapter.title}" — Pass ${STRUCTURED_ORDER.indexOf(phase) + 1}/5
Current Pass: ${phase}
Completed Passes: ${chapter.completedPasses.join(" → ") || "None"}

[CONTINUITY LEDGER — What previous passes established]
${history}

${worldContext}

[PERSONA INSTRUCTION]
${persona}

[PASS RULES]
- Build ON TOP of what previous passes established. Reference the Continuity Ledger.
- CONSISTENCY: You must adhere to the World Bible constraints and entity descriptions.
- When this pass is complete, call advancePass() to lock your work and proceed.
    `.trim();
    }
}

