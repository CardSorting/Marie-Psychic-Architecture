import { MarieCLI } from "../../../../adapters/CliMarieAdapter.js";
import { Log } from "../ProductionLogger.js";
import { WorldService } from "../WorldService.js";
import { captureWithRetry, extractJSON } from "../ProductionUtils.js";

export async function passSimulation(
    marie: MarieCLI,
    ch: any,
    log: Log,
    worldService: WorldService
): Promise<boolean> {
    const bible = worldService.getBible();
    const factions = bible.entities.filter(e => e.type === "FACTION");
    const factionContext = JSON.stringify(factions, null, 2);

    const prompt = `MODE: SIMULATION. You are the Dungeon Master. 
    Review the 'Active Factions' and their goals:
    ${factionContext}

    Current Date: ${JSON.stringify(bible.currentDate)}

    Based on previous events and current world state, simulate their off-screen actions. 
    Output a JSON 'worldDelta' with updates to their state, resources, or new events/relationships. 
    Do NOT write prose. 
    Format your output as valid JSON.`;

    const raw = await captureWithRetry(marie, prompt, log, ch.id, "SIMULATION", "World Simulation", 100);

    try {
        const delta = extractJSON(raw);
        if (!delta) {
            await log.write(ch.id, "SIMULATION", "❌ Failed to parse simulation JSON (Null result).");
            return false;
        }
        await worldService.applyWorldDelta(delta);
        await log.write(ch.id, "SIMULATION", "✅ Simulation complete. World Delta applied.");
        return true;
    } catch (e) {
        await log.write(ch.id, "SIMULATION", "❌ Failed to parse simulation JSON.");
        return false;
    }
}
