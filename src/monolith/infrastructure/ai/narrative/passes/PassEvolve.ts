import * as fs from "node:fs/promises";
import { MarieCLI } from "../../../../adapters/CliMarieAdapter.js";
import { Log } from "../ProductionLogger.js";
import { WorldService } from "../WorldService.js";
import { captureWithRetry } from "../ProductionUtils.js";

export async function passEvolve(
    marie: MarieCLI,
    prosePath: string,
    log: Log,
    chapterId: number,
    worldService: WorldService
): Promise<boolean> {
    const prose = await fs.readFile(prosePath, "utf-8");
    const state = await worldService.getNarrativeState();

    const prompt = `Historian Mode. Analyze the following verified chapter text.
    
    TEXT:
    ${prose.slice(0, 15000)}
    
    CURRENT STATE:
    - Active Threads: ${state.plotThreads.map((t: any) => t.name).join(", ")}
    
    TASK:
    Identify PERMANENT changes to the world or characters.
    1. Did a Plot Thread resolve? Or a new one start?
    2. Did a Character die, move, or change goals?
    3. Did a Location change (e.g., destroyed)?
    
    OUTPUT JSON:
    {
        "threadUpdates": [ { "id": "string", "status": "RESOLVED" | "IN_PROGRESS", "intensity": number } ],
        "newThreads": [ { "name": "string", "description": "string", "status": "OPEN" } ],
        "characterUpdates": [ { "name": "string", "newGoal": "string", "newLocation": "string" } ]
    }`;

    const raw = await captureWithRetry(marie, prompt, log, chapterId, "EVOLVE", "World Update", 100);

    try {
        const updates = JSON.parse(raw);

        await log.write(chapterId, "EVOLVE", `World Updates: ${updates.threadUpdates?.length || 0} threads, ${updates.characterUpdates?.length || 0} chars.`);

        // Apply Updates
        if (updates.threadUpdates) {
            for (const t of updates.threadUpdates) {
                await worldService.updatePlotThread(t.id, t);
            }
        }

        if (updates.newThreads) {
            for (const t of updates.newThreads) {
                // Generate a simple ID
                const id = t.name.toUpperCase().replace(/\s+/g, "_");
                await worldService.updatePlotThread(id, { ...t, id });
            }
        }

        // We don't have a direct character update method exposed yet for goal/location in WorldService
        // efficiently, but we can log them for now or add that method. 
        // For this phase, we'll log them as Narrative Events.

        return true;
    } catch {
        await log.write(chapterId, "EVOLVE", "Failed to parse World Updates. Skipping evolution.");
        return true;
    }
}
