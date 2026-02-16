import * as fs from "node:fs/promises";
import { MarieCLI } from "../../../../adapters/CliMarieAdapter.js";
import { Log } from "../ProductionLogger.js";
import { WorldService } from "../WorldService.js";
import { BlueprintService } from "../BlueprintService.js";
import { captureWithRetry } from "../ProductionUtils.js";

export async function passBlueprint(
    marie: MarieCLI,
    ch: any,
    targetPath: string, // .vault/novel/chapters/Chapter_X_Blueprint.json
    log: Log,
    worldService: WorldService,
    prevSummary: string,
    feedback?: any // EngagementReport
): Promise<boolean> {
    const bpService = new BlueprintService(worldService);
    const lore = worldService.getWorldContext([ch.title]);

    const mandate = feedback
        ? `\n🚨 EXECUTIVE MANDATE (PREVIOUS ATTEMPT FAILED):\nThe previous draft was rejected. REASON: ${feedback.verdict}.\nISSUES: ${feedback.plotHoles.join(", ")}\nBOREDOM: ${feedback.boredomIndex}/10.\nYOU MUST FIX THIS. CHANGE THE STRUCTURE.`
        : "";

    const prompt = `Architect Mode. Create a structural BLUEPRINT for Chapter ${ch.id}: "${ch.title}".
    
    CONTEXT:
    ${lore}
    
    PREVIOUS CHAPTER:
    ${prevSummary}
    ${mandate}
    
    Task: Output a JSON list of scenes.`;
    const raw = await captureWithRetry(marie, prompt, log, ch.id, "BLUEPRINT", "Structure Generation", 20);

    const blueprint = bpService.parseBlueprint(raw);
    if (!blueprint) {
        await log.write(ch.id, "BLUEPRINT", "Failed to parse JSON.");
        return false;
    }

    if (!bpService.validateBlueprint(blueprint)) {
        await log.write(ch.id, "BLUEPRINT", `Validation Failed: ${blueprint.validationErrors.join(", ")}`);
        // In the future: Auto-fix loop
        return false;
    }

    await fs.writeFile(targetPath, JSON.stringify(blueprint, null, 2));
    await log.write(ch.id, "BLUEPRINT", `✅ Saved valid blueprint with ${blueprint.scenes.length} scenes.`);
    return true;
}
