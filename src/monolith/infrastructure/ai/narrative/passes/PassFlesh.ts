import * as fs from "node:fs/promises";
import * as path from "node:path";
import { MarieCLI } from "../../../../adapters/CliMarieAdapter.js";
import { Log } from "../ProductionLogger.js";
import { EditorialService, CritiqueResult } from "../EditorialService.js";
import { captureWithRetry, captureAgentOutput, readSafe, countWords, sleep, extractJSON } from "../ProductionUtils.js";

import { WorldService } from "../WorldService.js";

export async function passFlesh(
    marie: MarieCLI,
    ch: any,
    targetPath: string,
    log: Log,
    lore: string,
    editorialService: EditorialService,
    worldService: WorldService
): Promise<boolean> {
    let skeleton = await readSafe(targetPath);

    // RESILIENCE: If skeleton is empty (e.g. was overwritten by a failed sync), 
    // try to recover from the beats partial file.
    if (skeleton.trim().length < 100) {
        const partialPath = targetPath.replace(".md", "_Beats_Partial.md");
        const partial = await readSafe(partialPath);
        if (partial.length > 100) {
            process.stdout.write(`   🩹 RECOVERING BEATS FROM PARTIAL: ${path.basename(partialPath)}\n`);
            skeleton = partial;
        }
    }

    let processedSkeleton = skeleton;

    // RESILIENCE: Check if AI delivered JSON beats instead of Markdown
    const parsed = extractJSON(skeleton);
    if (parsed && (parsed.beats || Array.isArray(parsed))) {
        const beatsList = Array.isArray(parsed) ? parsed : (parsed.beats || []);
        processedSkeleton = beatsList.map((b: any, i: number) => {
            const title = b.title || `Scene ${i + 1}`;
            const setting = b.setting || "n/a";
            const chars = b.characters ? b.characters.join(", ") : "n/a";
            const steps = Array.isArray(b.beats) ? b.beats.join("\n- ") : (b.beats || "");
            return `**Scene ${i + 1}: ${title}**\nSetting: ${setting}\nCharacters: ${chars}\nBeats:\n- ${steps}`;
        }).join("\n\n");
        process.stdout.write(`   🧩 CONVERTED JSON BEATS TO MARKDOWN.\n`);
    }

    // Parse scenes from Skeleton using simple regex since we structured it
    const scenes = processedSkeleton.split(/(?=\*\*Scene \d+:)/).filter(s => s.trim().length > 0 && s.includes("**Scene"));

    if (scenes.length === 0) {
        await log.write(ch.id, "FLESH", "❌ No scenes detected in skeleton. Check BEATS/SKELETON output.");
        return false;
    }

    // ─── TEMP DIRECTORY FOR ATOMIC RESUMPTION ───
    const tempDir = targetPath.replace(".md", "_Temp");
    await fs.mkdir(tempDir, { recursive: true });

    const proseParts: string[] = [`# Chapter ${ch.id}: ${ch.title}\n\n`];
    let previousSceneEnding = "";

    // Load existing progress into proseParts
    for (const sceneBlock of scenes) {
        const titleMatch = sceneBlock.match(/\*\*Scene (\d+): (.+?)\*\*/);
        if (!titleMatch) continue;
        const id = titleMatch[1];
        const title = titleMatch[2];
        const sceneFile = path.join(tempDir, `Scene_${id}.md`);

        const existingProse = await readSafe(sceneFile);
        if (existingProse.length > 500) {
            process.stdout.write(`   📜 Scene ${id} loaded from temp cache.\n`);
            proseParts.push(`## Scene ${id}: ${title}\n\n${existingProse}\n\n---\n\n`);
            previousSceneEnding = existingProse;
        } else {
            // This is the first missing scene
            break;
        }
    }

    // Incremental writer helper
    const syncChapterFile = async () => {
        await fs.writeFile(targetPath, proseParts.join(""));
    };

    // Initialize/Sync starting state ONLY if we have prose to sync
    // This prevents wiping the beat sheet if something fails early
    if (proseParts.length > 1) {
        await syncChapterFile();
    }

    for (const sceneBlock of scenes) {
        const titleMatch = sceneBlock.match(/\*\*Scene (\d+): (.+?)\*\*/);
        const id = titleMatch ? titleMatch[1] : "?";
        const title = titleMatch ? titleMatch[2] : "Unix scene";
        const sceneFile = path.join(tempDir, `Scene_${id}.md`);
        const partialFile = path.join(tempDir, `Scene_${id}_Partial.md`);

        // Skip if already in proseParts (loaded from cache)
        if (proseParts.some(p => p.startsWith(`## Scene ${id}:`))) continue;

        // ─── CONTEXT INJECTION ───
        const possibleNames = sceneBlock.match(/\b[A-Z][a-z]+\b/g) || [];
        const uniqueNames = [...new Set(possibleNames)];
        const actorCards = worldService.getCharacterProfiles(uniqueNames);

        // ─── ESCALATION MANAGER ───
        let currentProse = "";
        let attempt = 0;
        let solved = false;

        while (attempt < 3 && !solved) {
            attempt++;

            // ─── QUANTUM WRITING (Parallel Generation) ───
            if (attempt === 1) {
                const p = `Novelist Mode. Write prose for Scene ${id}: "${title}".
                ${lore}
                ACTOR PROFILES: ${actorCards}
                PREVIOUS: ...${previousSceneEnding.slice(-500)}
                NOTES: ${sceneBlock}
                Write 600-1000 words. High drama.`;

                // Uses streamToFile for the current attempt
                currentProse = await captureWithRetry(marie, p, log, ch.id, "FLESH", `Scene ${id}`, 300, 2, partialFile);
            } else {
                process.stdout.write(`   ⚛️  QUANTUM MODE ENGAGED (Generating 3 Variants)...\n`);
                const flavors = [
                    { type: "ACTION", focus: "Pacing, Kinetic Movement, Impact" },
                    { type: "SUBTEXT", focus: "Hidden Meanings, Psychological Tension, Silence" },
                    { type: "SENSORY", focus: "Atmosphere, Smell, Texture, Immersion" }
                ];

                const promises = flavors.map(async (flavor, idx) => {
                    const qPrompt = `Novelist Mode. Write prose for Scene ${id}: "${title}".
                    STYLE FOCUS: ${flavor.type} (${flavor.focus})
                    ${lore}
                    ACTOR PROFILES: ${actorCards}
                    PREVIOUS: ...${previousSceneEnding.slice(-500)}
                    NOTES: ${sceneBlock}
                    Write 600-1000 words.`;
                    const vPartial = path.join(tempDir, `Scene_${id}_V${idx}_Partial.md`);
                    return captureWithRetry(marie, qPrompt, log, ch.id, "FLESH", `Variant ${flavor.type}`, 300, 2, vPartial);
                });

                const results = await Promise.all(promises);
                const selectionPrompt = `Chief Editor Mode. Select the best version of Scene ${id}.\nVARIANT A (ACTION):\n${results[0].slice(0, 500)}...\nVARIANT B (SUBTEXT):\n${results[1].slice(0, 500)}...\nVARIANT C (SENSORY):\n${results[2].slice(0, 500)}...\nTASK: Return the Index (0, 1, or 2) of the best version. Just the number.`;

                const choice = await captureAgentOutput(marie, selectionPrompt);
                const winnerIndex = parseInt(choice.match(/\d/)?.[0] || "0");
                process.stdout.write(`   🏆 Quantum Collapse: Variant ${flavors[winnerIndex].type} Selected.\n`);

                currentProse = results[winnerIndex];
                await fs.writeFile(partialFile, currentProse); // Upgrade partial to the winner
                await log.write(ch.id, "FLESH", `Quantum Selection: ${flavors[winnerIndex].type}`);
            }

            // ─── THE GAUNTLET ───
            process.stdout.write(`\n⚔️  Entering The Gauntlet (Scene ${id}, Attempt ${attempt})...\n`);
            const critiques: CritiqueResult[] = [];
            const editors = attempt > 1 ? ["CHIEF_EDITOR", "DIRECTOR", "LOGICIAN", "THE_FIXER"] as const : ["CHIEF_EDITOR", "DIRECTOR", "LOGICIAN"] as const;

            for (const role of editors) {
                const cPrompt = editorialService.getPrompt(role, currentProse, lore);
                const res = await captureAgentOutput(marie, cPrompt);
                critiques.push(editorialService.parseCritique(role as any, res));
            }

            const decision = editorialService.makeDecision(critiques);

            if (decision.outcome === "APPROVE") {
                solved = true;
                await log.write(ch.id, "FLESH", `Scene ${id} Approved (Avg: ${decision.averageScore.toFixed(1)})`);
            } else {
                await log.write(ch.id, "FLESH", `Gauntlet Rejected (${decision.outcome}). Strategy: ${decision.strategy}`);
                process.stdout.write(`   ⚠️  Rejected. Strategy: ${decision.strategy}\n`);

                if (decision.strategy === "PROSE_FIX") {
                    const fixPrompt = editorialService.generateRevisionDirectives(decision, currentProse);
                    const fixed = await captureWithRetry(marie, fixPrompt, log, ch.id, "FLESH", `Fix Scene ${id}`, countWords(currentProse), 2, partialFile + "_fixed");
                    if (countWords(fixed) > countWords(currentProse) * 0.5) {
                        currentProse = fixed;
                        await fs.writeFile(partialFile, currentProse);
                        const fatal = critiques.some(c => c.blocking);
                        if (!fatal) solved = true;
                    }
                } else if (decision.strategy === "STRUCTURAL_REWRITE" || attempt === 3) {
                    process.stdout.write(`   🚨 CALLING THE PLOT DOCTOR (Structural Emergency)...\n`);
                    const doctorPrompt = editorialService.getPrompt("PLOT_DOCTOR", currentProse, lore);
                    const doctorRaw = await captureAgentOutput(marie, doctorPrompt);
                    const prescription = editorialService.parseCritique("PLOT_DOCTOR" as any, doctorRaw);
                    process.stdout.write(`   💉 Doctor's Orders: ${prescription.feedback}\n`);
                    await log.write(ch.id, "FLESH", `DOCTOR INTERVENTION: ${prescription.feedback}`);

                    const rewritePrompt = `Novelist Mode. REWRITE Scene ${id} completely.\nDOCTOR'S ORDERS (STRICT):\n${prescription.feedback}\nPrevious Context:\n${lore}\nWrite 800-1200 words. Execute the intervention.`;
                    currentProse = await captureWithRetry(marie, rewritePrompt, log, ch.id, "FLESH", `Doctor Rewrite ${id}`, 400, 2, partialFile + "_doctor");
                    solved = true;
                }
            }
        }

        if (!solved) {
            await log.write(ch.id, "FLESH", `Scene ${id} FAILED after 3 attempts. Manual Review Required.`);
            const failedBlock = `## Scene ${id}: ${title} [FAILED]\n\n> [!WARNING] DEADLOCK\n> The AI could not resolve this scene.\n\n${currentProse}\n\n---\n\n`;
            proseParts.push(failedBlock);
        } else {
            // Save to temp file
            await fs.writeFile(sceneFile, currentProse);
            proseParts.push(`## Scene ${id}: ${title}\n\n${currentProse}\n\n---\n\n`);
            previousSceneEnding = currentProse;
            // Clean partial
            await readSafe(partialFile).then(() => fs.unlink(partialFile).catch(() => { }));
        }

        // IMMEDIATELY SYNC CHAPTER FILE AFTER EACH SCENE
        await syncChapterFile();
    }

    await sleep(2000);
    return true;
}
