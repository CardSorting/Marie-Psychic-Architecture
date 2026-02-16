import * as fs from "node:fs/promises";
import { MarieCLI } from "../../../../adapters/CliMarieAdapter.js";
import { Log } from "../ProductionLogger.js";
import { WorldService } from "../WorldService.js";
import { captureWithRetry, extractJSON } from "../ProductionUtils.js";

export async function passFoundation(
    marie: MarieCLI,
    ch: any,
    targetPath: string, // Blueprint path
    log: Log,
    worldService: WorldService,
    prevSummary: string
): Promise<boolean> {
    const worldContext = worldService.getWorldContext();

    const prompt = `MODE: FOUNDATION. You are the World Architect. 
    Establish the constraints, world state, and narrative arc for Chapter ${ch.id}: "${ch.title}".
    
    WORLD BIBLE:
    ${worldContext}

    PREVIOUS CHAPTER CONTEXT:
    ${prevSummary}

    Output a JSON object with: 
    { 
        "worldState": "string describing current specific conditions for this chapter", 
        "narrativeArc": "string describing the emotional and plot journey", 
        "constraints": ["list of structural or lore rules to follow"], 
        "worldDelta": { "newEntities": [], "updatedEntities": [] } 
    }
    
    Ensure strict adherence to the World Bible.`;

    const blueprintPartial = targetPath.replace(".json", "_Blueprint_Partial.json");
    const raw = await captureWithRetry(marie, prompt, log, ch.id, "FOUNDATION", "Foundation JSON Blueprint", 100, 2, blueprintPartial);

    try {
        const foundation = extractJSON(raw);
        if (!foundation) {
            await log.write(ch.id, "FOUNDATION", "❌ Failed to parse foundation JSON (Null result).");
            return false;
        }
        await fs.writeFile(targetPath, JSON.stringify(foundation, null, 2));
        if (foundation.worldDelta) {
            await worldService.applyWorldDelta(foundation.worldDelta);
        }
        await log.write(ch.id, "FOUNDATION", "✅ Foundation established and World Delta applied.");
        return true;
    } catch (e) {
        await log.write(ch.id, "FOUNDATION", "❌ Failed to parse foundation JSON.");
        return false;
    }
}
