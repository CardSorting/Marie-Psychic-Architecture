import * as fs from "node:fs/promises";
import { MarieCLI } from "../../../../adapters/CliMarieAdapter.js";
import { Log } from "../ProductionLogger.js";
import { EditorialService } from "../EditorialService.js";
import { captureWithRetry, captureAgentOutput, readSafe, countWords } from "../ProductionUtils.js";

export async function passNerve(
    marie: MarieCLI,
    ch: any,
    targetPath: string,
    log: Log,
    lore: string,
    editorialService: EditorialService
): Promise<boolean> {
    const flesh = await readSafe(targetPath);
    const scenes = flesh.split(/(?=## Scene \d+:)/).filter(s => s.trim().length > 0);
    const nerveParts: string[] = [`# Chapter ${ch.id}: ${ch.title} [NERVE]\n\n`];

    for (const sceneBlock of scenes) {
        const titleMatch = sceneBlock.match(/## Scene (\d+): (.+?)\n/);
        const id = titleMatch ? titleMatch[1] : "?";

        // Skip header if it exists in the split
        if (!titleMatch && sceneBlock.includes("# Chapter")) continue;

        const prompt = `Sensory Editor Mode. Enhance the following scene.
        ${lore}
        
        CRITICAL INSTRUCTIONS:
        1. DO NOT change dialogue or plot events.
        2. Inject SENSORY DETAILS: Temperature, Smell, Texture, Ambient Sound.
        3. Fix "White Room Syndrome". Describe the lighting and the ground.
        4. Maintain the "Show, Don't Tell" rule.
        
        SCENE TO ENHANCE:
        ${sceneBlock}
        
        Output the enhanced scene text ONLY.`;

        let enhanced = await captureWithRetry(marie, prompt, log, ch.id, "NERVE", `Enhance Scene ${id}`, countWords(sceneBlock));

        // Gauntlet (Sensory Only)
        // Note: In real usage, we should check if persona exists or fallback.
        // We added SENSORY_EDITOR, so it should be fine.
        const cPrompt = editorialService.getPrompt("SENSORY_EDITOR", enhanced, lore);
        const res = await captureAgentOutput(marie, cPrompt);
        // We need to cast the role to any or update EditorialService to accept string if strict typing is an issue
        // The current signature is (role: PersonaRole, ...). 
        // We might need to update PersonaRole type definition if it's an enum/union.
        const critique = editorialService.parseCritique("SENSORY_EDITOR" as any, res);

        if (critique.score < 7) {
            process.stdout.write(`   ⚠️  Sensory issues: ${critique.feedback.substring(0, 50)}...\n`);
            // Quick fix loop
            const fixPrompt = `Fix these sensory issues:\n${critique.feedback}\n\nScene:\n${enhanced}`;
            enhanced = await captureWithRetry(marie, fixPrompt, log, ch.id, "NERVE", `Fix Scene ${id}`, countWords(enhanced));
        }

        nerveParts.push(`${enhanced}\n\n---\n\n`);
        await fs.writeFile(targetPath, nerveParts.join(""));
    }
    return true;
}
