import { MarieCLI } from "../../../../adapters/CliMarieAdapter.js";
import { Log } from "../ProductionLogger.js";
import { captureWithRetry } from "../ProductionUtils.js";
import * as fs from "node:fs/promises";

export async function passBeats(
    marie: MarieCLI,
    ch: any,
    foundationPath: string,
    targetPath: string, // Beat sheet path
    log: Log,
    worldContext: string
): Promise<boolean> {
    let foundation: any = {};
    try {
        const data = await fs.readFile(foundationPath, "utf-8");
        foundation = JSON.parse(data);
    } catch (e) {
        await log.write(ch.id, "BEATS", "⚠️ No foundation found. Proceeding with generic beats.");
    }

    const prompt = `MODE: BEATS. You are the Scene Director. 
    Create a detailed beat sheet for Chapter ${ch.id}: "${ch.title}".
    
    FOUNDATION:
    ${JSON.stringify(foundation, null, 2)}

    WORLD CONTEXT:
    ${worldContext}

    Each beat must advance the plot and reveal character. 
    Output a structured list of beats in MARKDOWN format. 
    IMPORTANT: Format each beat block starting with "**Scene X: [Scene Title]**" followed by the setting, characters, and detailed beats.
    Do NOT output JSON. Use pure Markdown.
    This is a blueprint — do NOT write full prose yet.`;

    const beatsPartial = targetPath.replace(".md", "_Beats_Partial.md");
    const raw = await captureWithRetry(marie, prompt, log, ch.id, "BEATS", "Beat Sheet Generation", 50, 2, beatsPartial);

    const formatted = `# Chapter ${ch.id}: ${ch.title} — BEATS\n\n${raw}`;
    await fs.writeFile(targetPath, formatted);
    await log.write(ch.id, "BEATS", "✅ Beat sheet generated and saved to .md");
    return true;
}
