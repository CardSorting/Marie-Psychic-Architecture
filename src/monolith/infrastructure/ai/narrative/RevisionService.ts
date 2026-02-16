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
        else if (ch.mode === "MUSIC_STUDIO") editors = ["STUDIO_HEAD", "BEAT_ARCHITECT", "CHART_ANALYST", "LYRICAL_GENIUS", "MIX_ENGINEER", "CHART_SURGEON", "DOPAMINE_ENGINEER"];

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

    public async applyStudioMastering(ch: NovelChapter, draft: string): Promise<string | null> {
        process.stdout.write(`   🎚️  Applying Billboard Master (Final Polish)...\n`);

        const prompt = `BILLBOARD MASTERING MODE.
DRAFT (Raw Recording):
${draft}

TASK:
1. Polish for 'Earworm Density'. Ensure the core hook is inescapable.
2. Inject THE VIRAL AUDIT:
   - Identify the 15-second "TikTok" moment (a high-impact snippet).
   - Ensure the "30-Second Rule" is met (conflict/hook established immediately).
   - Verify "Sonic Clarity" — strip all narrative 'mud'.
3. Maximize the 'Star Power' and 'Edge' of the performance.
4. Verify the 'Vocal Presence' (Character Voice) is commanding.
5. Enforce Brief -> Hook -> Beat Sheet -> Recording -> Re-Amping -> Polarization -> Billboard Master -> Remix framework.

OUTPUT: The final mastered and perfected Billboard #1 content.
`;
        return await captureWithRetry(this.marie, prompt, this.log, ch.id, "MIX_AND_MASTER", "Billboard Mastered", 400);
    }

    public async applyRecursiveReAmping(ch: NovelChapter, draft: string): Promise<string | null> {
        process.stdout.write(`   🔌 Re-Amping Prose (Recursive Layering)...\n`);

        const prompt = `RE-AMPING MODE (Recursive Layering).
DRAFT:
${draft}

TASK:
1. Increase the 'Emotional Volume'. 
2. Layer in 3-5 subtle 'Motif Callbacks' from the Brief and Beat Sheet.
3. Inject 'Production Value' — elevate the vocabulary and sentence cadence.
4. Ensure the 'Rhythm Section' (sentence length variation) is dynamic.
5. Focus on the 'Deep Subtext' of the dialogue.

OUTPUT: The re-amped and layered multi-platinum prose.
`;
        return await captureWithRetry(this.marie, prompt, this.log, ch.id, "RE_AMPING", "Re-Amped Recording", 400);
    }

    public async applyPolarizationPass(ch: NovelChapter, draft: string): Promise<string | null> {
        process.stdout.write(`   ⚡ Injecting Polarization (The Edge)...\n`);

        const prompt = `POLARIZATION PASS.
DRAFT:
${draft}

TASK:
1. Add an 'Edge'. A choice, a line, or a realization that forces the reader into an emotional response.
2. Sharpen the 'Conversation Starter' moment. Make it unignorable.
3. Ensure high situational urgency.
4. Polish the X-Factor moment for maximum impact.

OUTPUT: The polarized and unignorable Billboard-tier track.
`;
        return await captureWithRetry(this.marie, prompt, this.log, ch.id, "POLARIZATION", "Polarized Track", 400);
    }

    public async applyPsychoacousticTuning(ch: NovelChapter, draft: string): Promise<string | null> {
        process.stdout.write(`   🎧 Psychoacoustic Tuning (The Swing)...\n`);

        const prompt = `PSYCHOACOUSTIC TUNING.
DRAFT:
${draft}

TASK:
1. Audit the syllabic density and 'Swing' of every sentence.
2. Ensure clear cognitive ease for the Hook and key punchlines.
3. Resolve paragraphs on satisfying, 'consonant' notes.
4. Final check for Earworm Saturation — make it feel earned and powerful.

OUTPUT: The perfectly tuned and cognitively satisfied Dynasty-ready track.
`;
        return await captureWithRetry(this.marie, prompt, this.log, ch.id, "REMIXING", "Remixed/Tuned Track", 400);
    }

    public async applyDeepRefinement(ch: NovelChapter, draft: string): Promise<string | null> {
        process.stdout.write(`   ⚕️  Chart Surgeon: Deep Refinement Pass...\n`);

        const prompt = `CHART SURGEON MODE (Deep Refinement).
DRAFT:
${draft}

TASK:
1. Micro-Audit: Scrutinize every line for rhythm, cadence, and "mouthfeel".
2. Hook Optimization: Ensure the chorus hits with maximum dopamine.
3. Emotional Calibration: Verify the emotional arc spikes at the Bridge.
4. Lyric Polish: Replace any generic phrasing with iconic, memorable imagery.
5. Goal: Ensure the track is "unskippable" and chemically addictive.

OUTPUT: The deeply refined and surgically perfected Billboard lyrics.
`;
        return await captureWithRetry(this.marie, prompt, this.log, ch.id, "DEEP_REFINEMENT", "Deep Refined Track", 400);
    }

    public async applyDopamineEngineering(ch: NovelChapter, draft: string): Promise<string | null> {
        process.stdout.write(`   🧪 Dopamine Engineering (Neuro-Optimization)...\n`);

        const prompt = `DOPAMINE ENGINEER MODE.
DRAFT:
${draft}

TASK:
1. Audit Time-to-Reward: Ensure the first hook hits within 7 seconds.
2. Calibrate Anticipation: Ensure the pre-chorus builds sufficient tension.
3. Inject Novelty Spikes: Add a surprising element (sound, word, rhythm) every 15 seconds.
4. Maximize Reward Density: Ensure every line has a sonic or lyrical payoff.

OUTPUT: The scientifically optimized and neurochemically addictive Billboard track.
`;
        return await captureWithRetry(this.marie, prompt, this.log, ch.id, "DOPAMINE_ENGINEERING", "Dopamine Optimized Track", 400);
    }

    public async applyGlobalLocalization(ch: NovelChapter, draft: string): Promise<string | null> {
        process.stdout.write(`   🌎 Applying Global Localization (Universal Resonance)...\n`);

        const prompt = `GLOBAL LOCALIZATION PASS.
DRAFT:
${draft}

TASK:
1. Audit for international appeal. Are motifs universally relatable?
2. Smooth out idioms that might block global understanding.
3. Inject the 'Cultural Bridge' — ensure the narrative gravity works across borders.
4. Prepare the track for international 'Icon' status.

OUTPUT: The globally localized and universally resonant Billboard track.
`;
        return await captureWithRetry(this.marie, prompt, this.log, ch.id, "LOCALIZATION", "Localized Track", 400);
    }

    public async applyViralForecasting(ch: NovelChapter, draft: string): Promise<string | null> {
        process.stdout.write(`   🔭 Viral Forecasting (Final Distillation)...\n`);

        const prompt = `VIRAL FORECASTING & FINAL DISTILLATION.
DRAFT (Current Lyrics):
${draft}

TASK:
1. **Compress Signal-to-Noise**: Keep lines that carry emotional voltage; cut those that explain it. Charge, not explanation.
2. **Convert Concept to Mouth Language**: Focus on vowels, rhythm, breath timing, and syllable stress. Ensure chantability and "singability" in one breath.
3. **Lower Cognitive Load**: Shift from "Think about this" to "Feel this." Use repetition and variation to engage the body, not just the brain.
4. **Protect the Subconscious Hook**: Reduce around the 1-3 lines that have staying power. Give them space to survive in silence.
5. **Stabilize Energy Curves**: Create tension, release, breath, and drop. Convert Architectural Spectacle into Performable Emotion.

OUTPUT: The FULL BODY of the distilled and perfected track (Lyrics). 
Return ONLY the optimized markdown content (Lyrics), not a report.`;

        return await captureWithRetry(this.marie, prompt, this.log, ch.id, "VIRAL_PROMO", "Distilled Track", 400);
    }
}



