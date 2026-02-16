import {
    NovelChapter,
    LedgerEntry,
} from "../NovelProductionService.js";
import { IProductionStrategy } from "./IProductionStrategy.js";
import { WorldService } from "../WorldService.js";
import * as path from "path";
import * as fs from "fs/promises";

export type MusicStudioPhase =
    | "BRIEF"
    | "HOOK_ISOLATION"
    | "BEAT_SHEET"
    | "RECORDING"
    | "PARALLEL_REFINEMENT"
    | "MIX_AND_MASTER"
    | "VIRAL_PROMO"
    | "CANON";

export const MUSIC_STUDIO_ORDER: MusicStudioPhase[] = [
    "BRIEF",
    "HOOK_ISOLATION",
    "BEAT_SHEET",
    "RECORDING",
    "PARALLEL_REFINEMENT",
    "MIX_AND_MASTER",
    "VIRAL_PROMO",
    "CANON",
];

export const MUSIC_STUDIO_PERSONA: Record<string, string> = {
    BRIEF:
        "MODE: STUDIO BRIEF. You are the Global A&R Executive. Identify the 'Hit Factor' with ruthless precision. Define the 'Billboard Trajectory' for absolute chart dominance.",
    HOOK_ISOLATION:
        "MODE: HIT SCOUT. Isolate the 3 most potential Hooks. Define the core motif that will become the 'Earworm' and dominate airwaves.",
    BEAT_SHEET:
        "MODE: BEAT ARCHITECT. Structure the track based on the selected Hook. Define the 'Billboard Formula' structure for maximum retention.",
    RECORDING:
        "MODE: LYRICAL GENIUS. Write the full bodies. Focus on punchlines, flow, and iconic vocal performance. Every line must be a caption.",
    PARALLEL_REFINEMENT:
        "MODE: MULTI-STEM COORDINATOR. Orchestrating simultaneous refinements: Re-Amping, Polarization, Localization, and Deep Refinement.",
    MIX_AND_MASTER:
        "MODE: EXECUTIVE PRODUCER. Imperial Synthesis. Merging all refined stems into the final Billboard #1 Master.",
    VIRAL_PROMO:
        "MODE: VIRAL FORECASTER. Social asset generation. Algorithm-ready audit. Distribution scripts for total saturation.",
    CANON:
        "MODE: ARCHIVIST. The track is Iconic (Empire Certified). Immutable. Read-only.",
};

export class MusicStudioProductionStrategy implements IProductionStrategy {
    public readonly mode = "MUSIC_STUDIO";

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
            currentPass: "BRIEF",
            completedPasses: [],
            continuityLedger: [],
            files: [],
            mode: "MUSIC_STUDIO",
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
            return { success: false, message: "Track is already Canon." };
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

        const currentPassIndex = MUSIC_STUDIO_ORDER.indexOf(chapter.currentPass as MusicStudioPhase);
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
            nextPass = MUSIC_STUDIO_ORDER[currentPassIndex + 1];
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
        const phase = chapter.currentPass as MusicStudioPhase;
        if (phase === "CANON") {
            return `
[TRACK STATUS: ICONIC (EMPIRE)]
${volumeContext}
All Tracks: CANON (Immutable)
[PERSONA INSTRUCTION]
${MUSIC_STUDIO_PERSONA.CANON}
        `.trim();
        }

        const worldContext = this.worldService.getWorldContext();
        const persona = MUSIC_STUDIO_PERSONA[phase] || MUSIC_STUDIO_PERSONA["RECORDING"];

        return `
[MUSIC STUDIO TRACK STATUS]
${volumeContext}
Active Track: "${chapter.title}" — Pass ${MUSIC_STUDIO_ORDER.indexOf(phase) + 1}/${MUSIC_STUDIO_ORDER.length}
Current Pass: ${phase}
Completed Passes: ${chapter.completedPasses.join(" → ") || "None"}

[SESSION LOG — What the council established]
${history}

${worldContext}

[PERSONA INSTRUCTION]
${persona}

[STUDIO RULES]
- Aim for ABSOLUTE BILLBOARD DOMINANCE (The Empire Standard).
- Tone: Global Media Empire, Iconic Legend standard.
- Goal: Global Cultural Dominance.
- Billboard Metrics:
    * Cultural Gravity: The track must feel like a core part of the global conversation.
    * Platform Saturation: Optimized for TikTok, Reels, and Global Airplay.
    * Localization Resonance: Universal appeal with targeted local nuance.
- Metaphors:
    * Narrative flow → Rhythm Section
    * Key reveals → The Drop
    * Sensory detail → Sonic Texture
    * Dialogue → Vocal Performance
- Build ON TOP of what previous passes established. Reference the Session Log.
- When this pass is complete, call advancePass() to lock your work and proceed.
    `.trim();
    }
}
