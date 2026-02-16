import * as fs from "node:fs/promises";
import { MarieCLI } from "../../../../adapters/CliMarieAdapter.js";
import { Log } from "../ProductionLogger.js";
import { Blueprint } from "../BlueprintService.js";
import { captureWithRetry, sleep } from "../ProductionUtils.js";

export async function passSkeleton(
    marie: MarieCLI,
    ch: any,
    blueprintPath: string,
    targetPath: string, // .md file
    log: Log,
    lore: string,
): Promise<boolean> {
    let blueprint: Blueprint;
    try {
        blueprint = JSON.parse(await fs.readFile(blueprintPath, "utf-8"));
    } catch {
        await log.write(ch.id, "SKELETON", "Missing Blueprint. Cannot proceed.");
        return false;
    }

    const assembled: string[] = [`# Chapter ${ch.id}: ${ch.title} — SKELETON\n\n`];
    assembled.push(`> Theme: ${blueprint.theme}\n\n`);

    for (const scene of blueprint.scenes) {
        const prompt = `Architect Mode. Expand Scene ${scene.id}: "${scene.title}" from Blueprint.
        
        CONTEXT:
        ${lore}
        
        BLUEPRINT:
        Purpose: ${scene.purpose}
        Pacing: ${scene.pacingType}
        Characters: ${scene.characters.join(", ")}
        Setting: ${scene.setting}

        TASK: Write detailed notes (Mood, Physical Actions, Subtext, Sensory Details).
        Output Notes ONLY.`;

        const notes = await captureWithRetry(marie, prompt, log, ch.id, "SKELETON", `Notes ${scene.id}`, 100);

        // ─── REHEARSAL (Logic Check) ───
        const logicPrompt = `Logic Director Mode. Review these notes for Scene ${scene.id}.
    
    WORLD CONTEXT:
    ${lore}
    
    SCENE NOTES:
    ${notes}
    
    TASK:
    Identify LOGIC ERRORS (e.g., Character using magic they don't have, impossible travel time, out-of-character actions).
    If OK, output "APPROVED".
    If FAILED, output "REVISE: <Reason>" and rewritten notes.`;

        const logicCheck = await captureWithRetry(marie, logicPrompt, log, ch.id, "SKELETON", `Logic Check ${scene.id}`, 5);

        let finalNotes = notes;
        if (!logicCheck.includes("APPROVED")) {
            await log.write(ch.id, "SKELETON", `⚠️ Logic Error detected in Scene ${scene.id}. Auto-correcting...`);
            // If the checking agent provided a revision, extracting might be hard without strict format.
            // For 'World Class', we'd parse strict JSON. Here we'll ask for a fix.
            const fixPrompt = `Fix the following logic error in the notes:
        ERROR: ${logicCheck}
        
        NOTES:
        ${notes}
        
        Output FIXED notes only.`;
            finalNotes = await captureWithRetry(marie, fixPrompt, log, ch.id, "SKELETON", `Logic Fix ${scene.id}`, 100);
        }

        assembled.push(`**Scene ${scene.id}: ${scene.title}**\n\n${finalNotes}\n\n---\n\n`);
        await sleep(2000);
    }

    await fs.writeFile(targetPath, assembled.join(""));
    return true;
}
