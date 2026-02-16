import * as fs from "node:fs/promises";
import { MarieCLI } from "../../../../adapters/CliMarieAdapter.js";
import { Log } from "../ProductionLogger.js";
import { WorldService } from "../WorldService.js";
import { captureWithRetry } from "../ProductionUtils.js";

export async function passContinuity(
    marie: MarieCLI,
    ch: any,
    log: Log,
    worldService: WorldService,
    prevSummary: string
): Promise<{ constraints: string[], narrativeUpdates: any }> {
    const state = await worldService.getNarrativeState();
    const lore = worldService.getWorldContext([ch.title]);

    const prompt = `Showrunner Mode. Analyze the continuity for Chapter ${ch.id}: "${ch.title}".
    
    PREVIOUS CHAPTER ENDING:
    ${prevSummary}
    
    CURRENT NARRATIVE STATE:
    - Volume Arc: ${state.volumeArc.goal} (${state.volumeArc.progress}%)
    - Active Threads: ${state.plotThreads.map((t: any) => `${t.name} (${t.status})`).join(", ")}
    - Tension: ${state.globalTension}/10
    
    LORE CONTEXT:
    ${lore}
    
    TASK:
    1. Identify which Plot Threads MUST advance in this chapter.
    2. Identify any continuity errors to avoid (e.g. dead characters reappearing).
    3. Set strict constraints for the Blueprint.
    
    OUTPUT JSON:
    {
        "requiredBeats": ["string"],
        "forbiddenTopics": ["string"],
        "suggestedTension": number,
        "threadUpdates": [ { "id": "string", "newStatus": "string" } ]
    }`;

    const raw = await captureWithRetry(marie, prompt, log, ch.id, "CONTINUITY", "Analysis", 20);

    try {
        const result = JSON.parse(raw);
        await log.write(ch.id, "CONTINUITY", `Showrunner Directives: ${result.requiredBeats.length} beats.`);

        // Auto-update thread status if the Showrunner says so
        if (result.threadUpdates) {
            for (const update of result.threadUpdates) {
                await worldService.updatePlotThread(update.id, update);
            }
        }

        return {
            constraints: result.requiredBeats || [],
            narrativeUpdates: result
        };
    } catch {
        await log.write(ch.id, "CONTINUITY", "Failed to parse Showrunner output. Proceeding with defaults.");
        return { constraints: [], narrativeUpdates: {} };
    }
}
