import * as fs from "node:fs/promises";
import { MarieCLI } from "../../../../adapters/CliMarieAdapter.js";
import { Log } from "../ProductionLogger.js";
import { EditorialService, CritiqueResult } from "../EditorialService.js";
import { captureWithRetry, captureAgentOutput, readSafe, countWords, sleep } from "../ProductionUtils.js";

export async function passFlesh(
    marie: MarieCLI,
    ch: any,
    targetPath: string,
    log: Log,
    lore: string,
    editorialService: EditorialService
): Promise<boolean> {
    const skeleton = await readSafe(targetPath);
    // Parse scenes from Skeleton using simple regex since we structured it
    const scenes = skeleton.split(/(?=\*\*Scene \d+:)/).filter(s => s.trim().length > 0);

    const proseParts: string[] = [`# Chapter ${ch.id}: ${ch.title}\n\n`];
    let previousSceneEnding = "";

    for (const sceneBlock of scenes) {
        const titleMatch = sceneBlock.match(/\*\*Scene (\d+): (.+?)\*\*/);
        const id = titleMatch ? titleMatch[1] : "?";
        const title = titleMatch ? titleMatch[2] : "Unix scene";

        // ─── ESCALATION MANAGER ───
        let currentProse = "";
        let attempt = 0;
        let solved = false;

        while (attempt < 3 && !solved) {
            attempt++;

            // GENERATE (Level 0 or Retry)
            const prompt = `Novelist Mode. Write prose for Scene ${id}: "${title}".
            ${lore}
            
            PREVIOUS SCENE ENDING:
            ...${previousSceneEnding.slice(-500)}

            NOTES:
            ${sceneBlock}
            
            ${attempt > 1 ? "PREVIOUS ATTEMPT FAILED. TRY A DIFFERENT ANGLE." : ""}

            Write 600-1000 words. High drama. Show, don't tell. Start immediately.`;

            if (attempt === 1) {
                currentProse = await captureWithRetry(marie, prompt, log, ch.id, "FLESH", `Scene ${id}`, 300);
            } else {
                currentProse = await captureWithRetry(marie, prompt, log, ch.id, "FLESH", `Scene ${id} (Retry ${attempt})`, 300);
            }

            // ─── THE GAUNTLET ───
            process.stdout.write(`\n⚔️  Entering The Gauntlet (Scene ${id}, Attempt ${attempt})...\n`);
            const critiques: CritiqueResult[] = [];

            const editors = attempt > 1 ? ["CHIEF_EDITOR", "DIRECTOR", "LOGICIAN", "THE_FIXER"] as const : ["CHIEF_EDITOR", "DIRECTOR", "LOGICIAN"] as const;

            for (const role of editors) {
                const cPrompt = editorialService.getPrompt(role, currentProse, lore);
                // Casting strict role 
                const res = await captureAgentOutput(marie, cPrompt);
                critiques.push(editorialService.parseCritique(role as any, res));
            }

            const decision = editorialService.makeDecision(critiques);

            if (decision.outcome === "APPROVE") {
                solved = true;
                await log.write(ch.id, "FLESH", `Scene ${id} Approved (Avg: ${decision.averageScore.toFixed(1)})`);
            } else {
                await log.write(ch.id, "FLESH", `Gauntlet Rejected (${decision.outcome}). Strategy: ${decision.strategy}`);
                process.stdout.write(`   ⚠️  Rejected. Strategy: ${decision.strategy}\n`);

                if (decision.strategy === "PROSE_FIX") {
                    const fixPrompt = editorialService.generateRevisionDirectives(decision, currentProse);
                    const fixed = await captureWithRetry(marie, fixPrompt, log, ch.id, "FLESH", `Fix Scene ${id}`, countWords(currentProse));
                    if (countWords(fixed) > countWords(currentProse) * 0.5) {
                        currentProse = fixed;
                        const fatal = critiques.some(c => c.blocking);
                        if (!fatal) solved = true;
                    }
                } else if (decision.strategy === "STRUCTURAL_REWRITE") {
                    process.stdout.write(`   🚨 ACTIVATING THE FIXER (Structural Rewrite Needed)...\n`);
                    const fixerPrompt = editorialService.getPrompt("THE_FIXER", currentProse, lore);
                    const fixerRaw = await captureAgentOutput(marie, fixerPrompt);
                    const fixerCritique = editorialService.parseCritique("THE_FIXER", fixerRaw);

                    process.stdout.write(`   🔧 Fixer Proposal: ${fixerCritique.feedback}\n`);
                    // In full impl, this feeds back into next prompt
                }
            }
        }

        if (!solved) {
            await log.write(ch.id, "FLESH", `Scene ${id} FAILED after 3 attempts. Manual Review Required.`);
            proseParts.push(`## Scene ${id}: ${title} [FAILED]\n\n> [!WARNING] DEADLOCK\n> The AI could not resolve this scene.\n\n${currentProse}\n\n---\n\n`);
        } else {
            proseParts.push(`## Scene ${id}: ${title}\n\n${currentProse}\n\n---\n\n`);
            previousSceneEnding = currentProse;
        }

        await fs.writeFile(targetPath, proseParts.join(""));
        await sleep(3000);
    }

    return true;
}
