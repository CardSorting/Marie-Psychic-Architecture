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
        assembled.push(`**Scene ${scene.id}: ${scene.title}**\n\n${notes}\n\n---\n\n`);
        await sleep(2000);
    }

    await fs.writeFile(targetPath, assembled.join(""));
    return true;
}
