import { MarieCLI } from "../../../adapters/CliMarieAdapter.js";
import { Log } from "./ProductionLogger.js";
import { NovelChapter } from "./NovelProductionService.js";
import { captureWithRetry, captureAgentOutput, readSafe, countWords, sleep } from "./ProductionUtils.js";
import { EditorialService, CritiqueResult, EditorialDecision } from "./EditorialService.js";

export class RevisionService {
    constructor(
        private marie: MarieCLI,
        private log: Log,
        private editorialService: EditorialService
    ) { }

    public async reviewDraft(ch: NovelChapter, draft: string): Promise<EditorialDecision> {
        process.stdout.write(`   ⚔️  Entering Editorial Gauntlet...\n`);

        // Select Editors based on Mode
        let editors = ["CHIEF_EDITOR", "PROSE"];
        if (ch.mode === "OP_ED") editors = ["OP_ED_COLUMNIST", "LOGICIAN", "CHIEF_EDITOR"];
        else if (ch.mode === "ARTICLE") editors = ["JOURNALIST", "LOGICIAN", "CHIEF_EDITOR"];
        else if (ch.mode === "SHORT_STORY") editors = ["DIRECTOR", "SENSORY_EDITOR", "VOICE_COACH"];
        else if (ch.mode === "LINKEDIN") editors = ["LINKEDIN_INFLUENCER", "AURA_AUDITOR", "CHIEF_EDITOR", "PROSE"];

        const critiques: CritiqueResult[] = [];

        for (const role of editors) {
            // @ts-ignore - Dynamic role mapping
            const prompt = this.editorialService.getPrompt(role, draft, "No extra context");
            // @ts-ignore
            const res = await captureAgentOutput(this.marie, prompt);
            // @ts-ignore
            critiques.push(this.editorialService.parseCritique(role, res));
        }

        const decision = this.editorialService.makeDecision(critiques);
        await this.log.write(ch.id, "REVIEW", `Decision: ${decision.outcome} (Avg: ${decision.averageScore})`);
        return decision;
    }

    public async applyFix(ch: NovelChapter, draft: string, critique: string): Promise<string | null> {
        process.stdout.write(`   🔧 Mechanical Turk Mode: Fixing Prose...\n`);

        const prompt = `Editor Mode. Fix the following text based on this critique:
CRITIQUE: ${critique}

CONTENT:
${draft}

INSTRUCTIONS:
- rewrite the content to address the critique.
- Maintain the original tone/style unless the critique says otherwise.
- Output ONLY the rewritten markdown content.`;

        const fixed = await captureWithRetry(this.marie, prompt, this.log, ch.id, "FIX", "Fixed Draft", countWords(draft));

        if (fixed && countWords(fixed) > countWords(draft) * 0.5) {
            return fixed;
        }
        return null;
    }

    public async polishDraft(ch: NovelChapter, draft: string): Promise<string | null> {
        process.stdout.write(`   ✨ Polishing Final Draft...\n`);

        const prompt = `Sub-Editor Mode. PROOFREAD and POLISH.
Fix grammar. Tighten phrasing. Enhance flow. 
Ensure formatting is perfect Markdown.
Do not change the core substance.
CONTENT:
${draft}`;

        const polished = await captureWithRetry(this.marie, prompt, this.log, ch.id, "POLISH", "Polished Draft", countWords(draft));

        if (polished && countWords(polished) > countWords(draft) * 0.5) {
            return polished;
        }
        return null;
    }
}
