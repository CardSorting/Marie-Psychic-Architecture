import * as fs from "node:fs/promises";
import { MarieCLI } from "../../../../adapters/CliMarieAdapter.js";
import { Log } from "../ProductionLogger.js";
import { EditorialService } from "../EditorialService.js";
import { captureWithRetry, captureAgentOutput, readSafe, countWords } from "../ProductionUtils.js";

export async function passSoul(
    marie: MarieCLI,
    ch: any,
    targetPath: string,
    log: Log,
    lore: string,
    editorialService: EditorialService
): Promise<boolean> {
    const nerve = await readSafe(targetPath);
    const scenes = nerve.split(/(?=## Scene \d+:)/).filter(s => s.trim().length > 0);
    const soulParts: string[] = [`# Chapter ${ch.id}: ${ch.title} [SOUL - FINAL]\n\n`];

    for (const sceneBlock of scenes) {
        const titleMatch = sceneBlock.match(/## Scene (\d+): (.+?)\n/);
        const id = titleMatch ? titleMatch[1] : "?";

        if (!titleMatch && sceneBlock.includes("# Chapter")) continue;

        const prompt = `Voice Coach Mode. Polish the following scene for publication.
        ${lore}
        
        CRITICAL INSTRUCTIONS:
        1. Audit Character Voice: Ensure distinct speech patterns for each character.
        2. Deepen Subtext: Remove "on the nose" dialogue.
        3. Thematic Resonance: Ensure the internal monologue connects to the Chapter Theme.
        4. Final Polish: Fix any clunky prose.
        
        SCENE TO POLISH:
        ${sceneBlock}
        
        Output the FINAL scene text ONLY.`;

        let polished = await captureWithRetry(marie, prompt, log, ch.id, "SOUL", `Polish Scene ${id}`, countWords(sceneBlock));

        // Gauntlet (Voice Only)
        const cPrompt = editorialService.getPrompt("VOICE_COACH", polished, lore);
        const res = await captureAgentOutput(marie, cPrompt);
        const critique = editorialService.parseCritique("VOICE_COACH" as any, res);

        if (critique.score < 8) { // Higher bar for Soul
            process.stdout.write(`   ⚠️  Voice issues: ${critique.feedback.substring(0, 50)}...\n`);
            const fixPrompt = `Fix these voice/subtext issues:\n${critique.feedback}\n\nScene:\n${polished}`;
            polished = await captureWithRetry(marie, fixPrompt, log, ch.id, "SOUL", `Fix Scene ${id}`, countWords(polished));
        }

        soulParts.push(`${polished}\n\n---\n\n`);
        await fs.writeFile(targetPath, soulParts.join(""));
    }
    return true;
}
