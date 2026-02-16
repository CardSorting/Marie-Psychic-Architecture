import { NarrativeFileSystem } from "./NarrativeFileSystem.js";
import { Log } from "./ProductionLogger.js";
import { NovelChapter } from "./NovelProductionService.js";
import { ContentPhase } from "./strategies/SimpleContentStrategy.js";
import * as path from "path";
import * as fs from "fs/promises";
import { readSafe } from "./ProductionUtils.js";
import { DraftingService } from "./DraftingService.js";
import { RevisionService } from "./RevisionService.js";
import { MarieCLI } from "../../../adapters/CliMarieAdapter.js";

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

        switch (pass as any) {
            case "BRIEF":
            case "STRATEGY":
                const strategy = await this.draftingService.generateMusicStudioBrief(ch);
                if (strategy) {
                    await this.fileSystem.writeContent(conceptPath, strategy);
                    success = true;
                    // @ts-ignore
                    nextPass = ch.mode === "MUSIC_STUDIO" ? "HOOK_ISOLATION" : "BEAT_SHEET";
                }
                break;

            case "HOOK_ISOLATION":
                const hook = await this.draftingService.generateHookSnippets(ch);
                if (hook) {
                    const hookPath = path.join(targetDir, `hook.md`);
                    await this.fileSystem.writeContent(hookPath, hook);
                    success = true;
                    // @ts-ignore
                    nextPass = "BEAT_SHEET";
                }
                break;

            case "CONCEPT":
                const concept = await this.draftingService.generateConcept(ch, rejectionFeedback);
                if (concept) {
                    await this.fileSystem.writeContent(conceptPath, concept);
                    success = true;
                    nextPass = "OUTLINE";
                }
                break;

            case "BEAT_SHEET":
            case "OUTLINE":
                const conceptContent = await readSafe(conceptPath);
                const hookPathForOutline = path.join(targetDir, `hook.md`);
                const hookContent = await readSafe(hookPathForOutline);
                const outlineInput = ch.mode === "MUSIC_STUDIO" ? `${conceptContent}\n\nHOOK ISOLATION:\n${hookContent}` : conceptContent;
                const outline = await this.draftingService.generateOutline(ch, outlineInput);
                if (outline) {
                    await this.fileSystem.writeContent(outlinePath, outline);
                    success = true;
                    nextPass = (ch.mode === "MUSIC_STUDIO" ? "RECORDING" : "DRAFT") as any;
                }
                break;

            case "RECORDING":
            case "DRAFT":
                const outlineContent = await readSafe(outlinePath);
                const draft = await this.draftingService.generateDraft(ch, outlineContent);
                if (draft) {
                    await this.fileSystem.writeContent(targetPath, draft);
                    success = true;
                    // @ts-ignore
                    nextPass = ch.mode === "MUSIC_STUDIO" ? "PARALLEL_REFINEMENT" : "REVIEW";
                }
                break;

            case "PARALLEL_REFINEMENT": {
                process.stdout.write(`   ⚡ Hyper-Parallel Refinement: Fanning out 5 stems...\n`);
                const baseDraft = await readSafe(targetPath);
                
                const tasks = [
                    { id: "RE_AMPING", run: (m: MarieCLI) => this.revisionService.applyRecursiveReAmping(ch, baseDraft, m) },
                    { id: "POLARIZATION", run: (m: MarieCLI) => this.revisionService.applyPolarizationPass(ch, baseDraft, m) },
                    { id: "LOCALIZATION", run: (m: MarieCLI) => this.revisionService.applyGlobalLocalization(ch, baseDraft, m) },
                    { id: "DEEP_REFINEMENT", run: (m: MarieCLI) => this.revisionService.applyDeepRefinement(ch, baseDraft, m) },
                    { id: "DOPAMINE", run: (m: MarieCLI) => this.revisionService.applyDopamineEngineering(ch, baseDraft, m) }
                ];

                // ⚡ allSettled prevents one bad stem from killing the whole track
                const settledResults = await Promise.allSettled(tasks.map(async (task) => {
                    const isolationMarie = new MarieCLI(this.workingDir);
                    try {
                        const res = await task.run(isolationMarie);
                        return { id: task.id, content: res };
                    } finally {
                        isolationMarie.dispose();
                    }
                }));

                const results = settledResults.map(r => r.status === 'fulfilled' ? r.value : null).filter(Boolean);
                const stemsPath = path.join(targetDir, `stems.json`);
                await fs.writeFile(stemsPath, JSON.stringify(results, null, 2));
                
                success = true;
                // @ts-ignore
                nextPass = "MIX_AND_MASTER";
                break;
            }

            case "RE_AMPING": {
                const draftRef = await readSafe(targetPath);
                const reAmpedResult = await this.revisionService.applyRecursiveReAmping(ch, draftRef);
                if (reAmpedResult) {
                    await this.fileSystem.writeContent(targetPath, reAmpedResult);
                    success = true;
                    // @ts-ignore
                    nextPass = "POLARIZATION";
                }
                break;
            }

            case "POLARIZATION": {
                const draftPol = await readSafe(targetPath);
                const polarizedResult = await this.revisionService.applyPolarizationPass(ch, draftPol);
                if (polarizedResult) {
                    await this.fileSystem.writeContent(targetPath, polarizedResult);
                    success = true;
                    // @ts-ignore
                    nextPass = "LOCALIZATION";
                }
                break;
            }

            case "LOCALIZATION": {
                const draftLoc = await readSafe(targetPath);
                const localizedResult = await this.revisionService.applyGlobalLocalization(ch, draftLoc);
                if (localizedResult) {
                    await this.fileSystem.writeContent(targetPath, localizedResult);
                    success = true;
                    // @ts-ignore
                    nextPass = "DEEP_REFINEMENT";
                }
                break;
            }

            case "DEEP_REFINEMENT": {
                const draftRefined = await readSafe(targetPath);
                const refinedResult = await this.revisionService.applyDeepRefinement(ch, draftRefined);
                if (refinedResult) {
                    await this.fileSystem.writeContent(targetPath, refinedResult);
                    success = true;
                    // @ts-ignore
                    nextPass = "DOPAMINE_ENGINEERING";
                }
                break;
            }

            case "DOPAMINE_ENGINEERING": {
                const draftDopamine = await readSafe(targetPath);
                const dopamineResult = await this.revisionService.applyDopamineEngineering(ch, draftDopamine);
                if (dopamineResult) {
                    await this.fileSystem.writeContent(targetPath, dopamineResult);
                    success = true;
                    // @ts-ignore
                    nextPass = "MIX_AND_MASTER";
                }
                break;
            }

            case "MIX_AND_MASTER":
            case "HARDENING": {
                if (ch.mode === "MUSIC_STUDIO") {
                    process.stdout.write(`   🧬 Imperial Synthesis (Mixing Stems)...\n`);
                    const stemsPath = path.join(targetDir, `stems.json`);
                    const stemsRaw = await readSafe(stemsPath);
                    const stems = stemsRaw ? JSON.parse(stemsRaw) : [];

                    const synthesisPrompt = `IMPERIAL SYNTHESIS MODE.
Merge these Stems into one MASTER Billboard #1 version. 
${stems.map((r: any) => `--- STEM: ${r.id} ---\n${r.content || "FAILED"}\n`).join("\n")}
OUTPUT: Final synthesized master. Markdown ONLY.`;

                    const synthMarie = new MarieCLI(this.workingDir);
                    const synthesizedMaster = await this.revisionService.applyStudioMastering(ch, synthesisPrompt, synthMarie);
                    synthMarie.dispose();

                    if (synthesizedMaster) {
                        await this.fileSystem.writeContent(targetPath, synthesizedMaster);
                        success = true;
                        // @ts-ignore
                        nextPass = "VIRAL_PROMO";
                    }
                } else {
                    const draftHard = await readSafe(targetPath);
                    const hardenedResult = await this.revisionService.applyStudioMastering(ch, draftHard);
                    if (hardenedResult) {
                        await this.fileSystem.writeContent(targetPath, hardenedResult);
                        success = true;
                        // @ts-ignore
                        nextPass = "VIRAL_PROMO";
                    }
                }
                break;
            }

            case "VIRAL_PROMO": {
                const finalTrackContent = await readSafe(targetPath);
                const forecastedResult = await this.revisionService.applyViralForecasting(ch, finalTrackContent);
                if (forecastedResult) {
                    const auditPath = path.join(targetDir, `audit.md`);
                    await this.fileSystem.writeContent(auditPath, forecastedResult);
                    await this.fileSystem.writeContent(targetPath, forecastedResult);
                }

                const updatedTrackContent = await readSafe(targetPath);
                const socialAssets = await this.draftingService.generateViralPromos(ch, updatedTrackContent);
                if (socialAssets) {
                    const promoPath = path.join(targetDir, `promo.md`);
                    await this.fileSystem.writeContent(promoPath, socialAssets);
                    success = true;
                    // @ts-ignore
                    nextPass = "CANON";
                }
                break;
            }

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
