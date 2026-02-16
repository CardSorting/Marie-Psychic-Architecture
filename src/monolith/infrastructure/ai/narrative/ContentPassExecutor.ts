import { NarrativeFileSystem } from "./NarrativeFileSystem.js";
import { MarieCLI } from "../../../adapters/CliMarieAdapter.js";
import { Log } from "./ProductionLogger.js";
import { EditorialService, CritiqueResult } from "./EditorialService.js";
import { NovelChapter } from "./NovelProductionService.js";
import { ContentPhase } from "./strategies/SimpleContentStrategy.js";
import * as path from "path";
import * as fs from "fs/promises";
import { captureWithRetry, captureAgentOutput, readSafe, countWords, sleep } from "./ProductionUtils.js";

export class ContentPassExecutor {
    constructor(
        private marie: MarieCLI,
        private log: Log,
        private editorialService: EditorialService,
        private workingDir: string,
        private fileSystem: NarrativeFileSystem
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
            // Fallback or create?
            // Use NarrativeFS to get the standardized path
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
                success = await this.passConcept(ch, conceptPath, rejectionFeedback);
                if (success) nextPass = "OUTLINE";
                break;
            case "OUTLINE":
                success = await this.passOutline(ch, conceptPath, outlinePath);
                if (success) nextPass = "DRAFT";
                break;
            case "DRAFT":
                success = await this.passDraft(ch, outlinePath, targetPath);
                if (success) nextPass = "REVIEW";
                break;
            case "REVIEW":
                const reviewResult = await this.passReview(ch, targetPath);
                success = reviewResult.success;
                if (success) nextPass = "POLISH";
                else return { success: false, feedback: reviewResult.feedback }; // Loop back?
                break;
            case "POLISH":
                success = await this.passPolish(ch, targetPath);
                if (success) nextPass = "FINAL";
                break;
            case "FINAL":
                success = true;
                break;
        }

        return { success, nextPass };
    }

    // ─── PASS IMPLEMENTATIONS ───

    private async passConcept(ch: NovelChapter, targetPath: string, feedback?: any): Promise<boolean> {
        process.stdout.write(`   💡 Generating Concept for ${ch.mode}: "${ch.title}"...\n`);

        const prompt = `Architect Mode. Create a High-Level Concept for a ${ch.mode}.
TITLE: ${ch.title}
DESCRIPTION: ${ch.description}
${feedback ? `FEEDBACK FROM PREVIOUS ATTEMPT: ${JSON.stringify(feedback)}` : ""}

OUTPUT FORMAT (Markdown):
# CONCEPT: ${ch.title}
## Core Thesis / Premise
(1-2 sentences)
## Target Audience
(Who is this for?)
## Key Themes / Arguments
- Point 1
- Point 2
## Tone & Style
(e.g. "Urgent", "Whimsical", "Academic")
`;
        const content = await captureWithRetry(this.marie, prompt, this.log, ch.id, "CONCEPT", "Concept Doc", 100);
        if (content) {
            await fs.writeFile(targetPath, content);
            return true;
        }
        return false;
    }

    private async passOutline(ch: NovelChapter, conceptPath: string, targetPath: string): Promise<boolean> {
        process.stdout.write(`   📝 Generating Outline...\n`);
        const concept = await readSafe(conceptPath);

        const prompt = `Planner Mode. Create a detailed OUTLINE based on this concept.
${concept}

REQUIREMENTS:
- For ARTICLES/OP-EDS: Use H1, H2, H3 structure with bullet points for content.
- For STORIES: Use Scene list with emotional beats.
- Be specific. Include "Target Word Count" per section.
`;
        const content = await captureWithRetry(this.marie, prompt, this.log, ch.id, "OUTLINE", "Outline", 200);
        if (content) {
            await fs.writeFile(targetPath, content);
            return true;
        }
        return false;
    }

    private async passDraft(ch: NovelChapter, outlinePath: string, targetPath: string): Promise<boolean> {
        process.stdout.write(`   ✍️  Drafting Content (Quantum Mode)...\n`);
        const outline = await readSafe(outlinePath);

        // Define Variants based on Mode
        let variants = [
            { type: "STANDARD", focus: "Balanced execution" },
            { type: "CREATIVE", focus: "High flair, metaphor, and style" },
            { type: "DIRECT", focus: "Concise, punchy, low-fluff" }
        ];

        if (ch.mode === "SHORT_STORY") {
            variants = [
                { type: "A: ACTION/PACING", focus: "Fast moving, high stakes" },
                { type: "B: ATMOSPHERE", focus: "Slow burn, sensory details" },
                { type: "C: CHARACTER", focus: "Internal monologue, deep POV" }
            ];
        } else if (ch.mode === "OP_ED") {
            variants = [
                { type: "A: PROVOCATIVE", focus: "Controversial, strong stance" },
                { type: "B: ANALYTICAL", focus: "Data-driven, logical flow" },
                { type: "C: EMPATHETIC", focus: "Personal connection, emotional appeal" }
            ];
        }

        // Generate Variants (Parallel)
        process.stdout.write(`   ⚛️  Generating ${variants.length} content variants...\n`);

        const promises = variants.map(async (v) => {
            const p = `Writer Mode. Write the FULL BODY text for this ${ch.mode}.
OUTLINE:
${outline}

STYLE VARIANT: ${v.type}
FOCUS: ${v.focus}
Keep it under 2000 words. Start with the Title.`;
            return captureWithRetry(this.marie, p, this.log, ch.id, "DRAFT", `Variant ${v.type}`, 400);
        });

        const results = await Promise.all(promises);

        // Collapse (Selection)
        const validResults = results.filter(r => r.length > 100);
        if (validResults.length === 0) return false;

        const selectionPrompt = `Editor-in-Chief Mode. Select the best draft.
${validResults.map((r, i) => `VARIANT ${i}:\n${r.slice(0, 500)}...\n`).join("\n")}
TASK: Return the Index (0-${validResults.length - 1}) of the best version. Just the number.`;

        const choice = await captureAgentOutput(this.marie, selectionPrompt);
        const winnerIndex = parseInt(choice.match(/\d/)?.[0] || "0");

        process.stdout.write(`   🏆 Selected Variant ${winnerIndex}: ${variants[winnerIndex]?.type || "Default"}\n`);

        if (validResults[winnerIndex]) {
            await fs.writeFile(targetPath, validResults[winnerIndex]);
            return true;
        }
        return false;
    }

    private async passReview(ch: NovelChapter, targetPath: string): Promise<{ success: boolean, feedback?: any }> {
        process.stdout.write(`   ⚔️  Entering Editorial Gauntlet...\n`);
        const draft = await readSafe(targetPath);

        // Select Editors based on Mode
        let editors = ["CHIEF_EDITOR", "PROSE"];
        if (ch.mode === "OP_ED") editors = ["OP_ED_COLUMNIST", "LOGICIAN", "CHIEF_EDITOR"];
        else if (ch.mode === "ARTICLE") editors = ["JOURNALIST", "LOGICIAN", "CHIEF_EDITOR"];
        else if (ch.mode === "SHORT_STORY") editors = ["DIRECTOR", "SENSORY_EDITOR", "VOICE_COACH"];

        const critiques: CritiqueResult[] = [];

        for (const role of editors) {
            // @ts-ignore - Dynamic role mapping
            const prompt = this.editorialService.getPrompt(role, draft, "No extra context");
            const res = await captureAgentOutput(this.marie, prompt);
            // @ts-ignore
            critiques.push(this.editorialService.parseCritique(role, res));
        }

        const decision = this.editorialService.makeDecision(critiques);
        await this.log.write(ch.id, "REVIEW", `Decision: ${decision.outcome} (Avg: ${decision.averageScore})`);

        if (decision.outcome === "APPROVE") {
            process.stdout.write(`   ✅ Draft Approved (${decision.averageScore}/10).\n`);
            return { success: true };
        } else {
            // Auto-fix if generic fix
            if (decision.strategy === "PROSE_FIX") {
                process.stdout.write(`   ⚠️  Draft Needs Polish. Applying fixes...\n`);
                // We don't fail, we just pass to Polish with strong instructions?
                // Or we fail and loop? 
                // For "Review" pass, let's say "Needs Polish" means we go to POLISH pass but success=true
                return { success: true };
            }

            process.stdout.write(`   🛑 Draft Rejected. Strategy: ${decision.strategy}\n`);
            return { success: false, feedback: decision };
        }
    }

    private async passPolish(ch: NovelChapter, targetPath: string): Promise<boolean> {
        process.stdout.write(`   ✨ Polishing Final Draft...\n`);
        const draft = await readSafe(targetPath);

        const prompt = `Sub-Editor Mode. PROOFREAD and POLISH.
Fix grammar. Tighten phrasing. Enhance flow. 
Ensure formatting is perfect Markdown.
Do not change the core substance.
CONTENT:
${draft}`;

        const polished = await captureWithRetry(this.marie, prompt, this.log, ch.id, "POLISH", "Polished Draft", countWords(draft));

        if (polished && countWords(polished) > countWords(draft) * 0.5) {
            await fs.writeFile(targetPath, polished);
            return true;
        }
        return false;
    }
}
