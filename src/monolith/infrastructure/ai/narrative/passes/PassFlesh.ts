import * as fs from "node:fs/promises";
import { MarieCLI } from "../../../../adapters/CliMarieAdapter.js";
import { Log } from "../ProductionLogger.js";
import { EditorialService, CritiqueResult } from "../EditorialService.js";
import { captureWithRetry, captureAgentOutput, readSafe, countWords, sleep } from "../ProductionUtils.js";

import { WorldService } from "../WorldService.js";

export async function passFlesh(
    marie: MarieCLI,
    ch: any,
    targetPath: string,
    log: Log,
    lore: string,
    editorialService: EditorialService,
    worldService: WorldService
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

        // ─── CONTEXT INJECTION ───
        // Extract capitalized names as a heuristic for characters present
        const possibleNames = sceneBlock.match(/\b[A-Z][a-z]+\b/g) || [];
        const uniqueNames = [...new Set(possibleNames)];
        const actorCards = worldService.getCharacterProfiles(uniqueNames);

        // ─── ESCALATION MANAGER ───
        let currentProse = "";
        let attempt = 0;
        let solved = false;

        while (attempt < 3 && !solved) {
            attempt++;

            // GENERATE (Level 0 or Retry)
            const prompt = `Novelist Mode. Write prose for Scene ${id}: "${title}".
            ${lore}

            ACTOR PROFILES (VOICE & MOTIVATION):
            ${actorCards}
            
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
                } else if (decision.strategy === "STRUCTURAL_REWRITE" || attempt === 3) {
                    process.stdout.write(`   🚨 CALLING THE PLOT DOCTOR (Structural Emergency)...\n`);
                    const doctorPrompt = editorialService.getPrompt("PLOT_DOCTOR", currentProse, lore);
                    const doctorRaw = await captureAgentOutput(marie, doctorPrompt);
                    const prescription = editorialService.parseCritique("PLOT_DOCTOR" as any, doctorRaw);

                    process.stdout.write(`   💉 Doctor's Orders: ${prescription.feedback}\n`);

                    await log.write(ch.id, "FLESH", `DOCTOR INTERVENTION: ${prescription.feedback}`);

                    // Rewrite with Doctor's Orders
                    const rewritePrompt = `Novelist Mode. REWRITE Scene ${id} completely.
          
          DOCTOR'S ORDERS (STRICT):
          ${prescription.feedback}
          
          Previous Context:
          ${lore}
          
          Write 800-1200 words. Execute the intervention.`;

                    currentProse = await captureWithRetry(marie, rewritePrompt, log, ch.id, "FLESH", `Doctor Rewrite ${id}`, 400);

                    // The Doctor's rewrite is usually final for this attempt loop
                    solved = true;
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
    }

    await fs.writeFile(targetPath, proseParts.join(""));
    await sleep(3000);

    return true;
}
