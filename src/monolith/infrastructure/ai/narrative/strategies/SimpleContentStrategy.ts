import {
    NovelChapter,
    LedgerEntry,
} from "../NovelProductionService.js";
import { IProductionStrategy } from "./IProductionStrategy.js";
import { EditorialPersonas } from "../EditorialPersonas.js";
import * as path from "path";
import * as fs from "fs/promises";

export type ContentPhase =
    | "CONCEPT"
    | "OUTLINE"
    | "DRAFT"
    | "REVIEW" // Editorial Review
    | "POLISH" // Final Polish
    | "FINAL";

export const CONTENT_ORDER: ContentPhase[] = [
    "CONCEPT",
    "OUTLINE",
    "DRAFT",
    "REVIEW",
    "POLISH",
    "FINAL",
];

export const CONTENT_PERSONA: Record<ContentPhase, string> = {
    CONCEPT:
        "MODE: CONCEPT. You are the Architect. Define the core idea, target audience, angle, and key takeaways. Output a brief but potent concept document.",
    OUTLINE:
        "MODE: OUTLINE. You are the Planner. Create a structured outline. For articles: H1, H2, bullet points. For stories: Scene list, beats.",
    DRAFT:
        "MODE: DRAFT. You are the Writer. Write the full content based on the outline. Focus on flow, voice, and clarity.",
    REVIEW:
        "MODE: EDITOR. You are the Editor. Review the draft for clarity, tone, and impact. Provide specific critique.",
    POLISH:
        "MODE: POLISHER. You are the Sub-Editor. Refine the prose. Fix grammar, improve word choice, sharpen the hooks.",
    FINAL:
        "MODE: ARCHIVIST. The content is Final. Read-only.",
};

export class SimpleContentStrategy implements IProductionStrategy {
    public readonly mode: string;

    constructor(mode: "SHORT_STORY" | "ARTICLE" | "OP_ED") {
        this.mode = mode;
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
            currentPass: "CONCEPT",
            completedPasses: [],
            continuityLedger: [],
            files: [],
            mode: this.mode,
        };
    }

    public async advancePass(
        chapter: NovelChapter,
        rootPath: string,
        summary: string,
        force: boolean,
        overrideNextPass?: string,
    ): Promise<{ success: boolean; message: string }> {
        if (chapter.currentPass === "FINAL") {
            return { success: false, message: "Content is already Final." };
        }

        // Auto-discovery of files
        // Pattern: Content_{ID}_{TitleClean}.md
        const vaultPath = path.join(rootPath, ".vault", "content"); // New directory for content
        try {
            await fs.mkdir(vaultPath, { recursive: true });
            const files = await fs.readdir(vaultPath);
            const titleClean = chapter.title.replace(/[^a-zA-Z0-9]/g, "_");
            const pattern = `${chapter.mode}_${chapter.id}_${titleClean}`;

            const contentFiles = files.filter(f => f.startsWith(pattern));

            if (contentFiles.length > 0) {
                chapter.files = contentFiles.map(f => path.join(".vault", "content", f));
            }
        } catch (e) {
            // Ignore
        }

        const currentPassIndex = CONTENT_ORDER.indexOf(chapter.currentPass as ContentPhase);
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
            nextPass = CONTENT_ORDER[currentPassIndex + 1] || "FINAL";
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
        const phase = chapter.currentPass as ContentPhase;
        if (phase === "FINAL") {
            return `[STATUS] FINAL (Immutable).\n${history}`;
        }

        let personaPrompt = CONTENT_PERSONA[phase];

        // Inject specialized persona based on generic mode if available
        if (this.mode === "ARTICLE" && phase === "DRAFT") {
            personaPrompt += `\nADOPE PERSONA: ${EditorialPersonas.JOURNALIST.prompt}`;
        } else if (this.mode === "OP_ED" && phase === "DRAFT") {
            personaPrompt += `\nADOPT PERSONA: ${EditorialPersonas.OP_ED_COLUMNIST.prompt}`;
        } else if (this.mode === "SHORT_STORY" && phase === "DRAFT") {
            personaPrompt += `\nADOPT PERSONA: ${EditorialPersonas.ESSAYIST.prompt}`; // Or similar
        }

        return `
[CONTENT PRODUCTION STATUS]
Type: ${this.mode}
Title: "${chapter.title}"
Current Pass: ${phase}
Passes: ${CONTENT_ORDER.join(" -> ")}

[HISTORY]
${history}

[INSTRUCTION]
${personaPrompt}
        `.trim();
    }
}
