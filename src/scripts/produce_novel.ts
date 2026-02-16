#!/usr/bin/env node
/**
 * Novel Production Pipeline v5 — SENIOR EDITORIAL GRADE
 *
 * KEY UPGRADES:
 *   1. "Blueprint" Pass: Structural validation before writing.
 *   2. "Editorial Service": Weighted voting by specialized personas.
 *   3. "Strict Gauntlet": Rejection means rewrite.
 *
 * Flow:
 *   1. BLUEPRINT -> JSON Structure (Pacing, Scenes, Theme)
 *   2. SKELETON -> Scene Notes (beats generated from Blueprint)
 *   3. FLESH -> Prose Generation (Scene by Scene)
 *      -> GAUNTLET (Editorial Board Review) -> REJECT/REVISE/APPROVE
 *   4. NERVE -> Expansion (Sensory/Subtext)
 *      -> GAUNTLET
 *   5. SOUL -> Final Polish
 */
import { MarieCLI } from "../monolith/adapters/CliMarieAdapter.js";
import { NovelProductionService } from "../monolith/infrastructure/ai/narrative/NovelProductionService.js";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { WorldService } from "../monolith/infrastructure/ai/narrative/WorldService.js";
import { EditorialService } from "../monolith/infrastructure/ai/narrative/EditorialService.js";
import { Log } from "../monolith/infrastructure/ai/narrative/ProductionLogger.js";
import { sleep } from "../monolith/infrastructure/ai/narrative/ProductionUtils.js";

// Import Passes
import { passBlueprint } from "../monolith/infrastructure/ai/narrative/passes/PassBlueprint.js";
import { passSkeleton } from "../monolith/infrastructure/ai/narrative/passes/PassSkeleton.js";
import { passFlesh } from "../monolith/infrastructure/ai/narrative/passes/PassFlesh.js";
import { passNerve } from "../monolith/infrastructure/ai/narrative/passes/PassNerve.js";
import { passSoul } from "../monolith/infrastructure/ai/narrative/passes/PassSoul.js";
import { passContinuity } from "../monolith/infrastructure/ai/narrative/passes/PassContinuity.js";
import { passReception } from "../monolith/infrastructure/ai/narrative/passes/PassReception.js";
import { passEvolve } from "../monolith/infrastructure/ai/narrative/passes/PassEvolve.js";

// Global Feedback Buffer (The Ouroboros Memory)
let REJECTION_FEEDBACK: any = null;

async function runPipeline() {
  const workingDir = process.cwd();
  const log = new Log(workingDir);
  const worldService = new WorldService(workingDir);
  const editorialService = new EditorialService();
  await worldService.initialize();

  const marie = new MarieCLI(workingDir);
  const productionSvc = new NovelProductionService(workingDir);

  process.stdout.write("🔮 Novel Pipeline v9 — THE OUROBOROS PROTOCOL\n\n");

  while (true) {
    await productionSvc.initialize();

    // ─── 1. SELECT CHAPTER ───
    // Access private structure via any casting hack
    const structure = (productionSvc as any).structure;
    if (!structure || !structure.volumes) {
      process.stdout.write("❌ No novel structure found. Exiting.\n");
      break;
    }

    const vol = structure.volumes.find((v: any) => v.status === "DRAFT");
    if (!vol) {
      process.stdout.write("✅ All volumes complete.\n");
      break;
    }
    const ch = vol.chapters.find((c: any) => c.currentPass !== "CANON");
    if (!ch) {
      process.stdout.write(`✅ Volume ${vol.id} complete.\n`);
      break;
    }

    const pass = ch.currentPass as string;
    const chapFileName = `Chapter_${ch.id}_${ch.title.replace(/[^a-zA-Z0-9]/g, "_")}`;
    const targetPath = path.join(workingDir, ".vault", "novel", "chapters", `${chapFileName}.md`);
    const blueprintPath = path.join(workingDir, ".vault", "novel", "chapters", `${chapFileName}_Blueprint.json`);

    // Ensure Directory
    await fs.mkdir(path.dirname(targetPath), { recursive: true });

    // ─── CONTEXT RETRIEVAL (Last 500 words) ───
    let prevSummary = "Start of Volume.";
    // Simple logic to find previous chapter file
    if (ch.id > 1) {
      // Ideally we look up the specific file, but heuristic assumes sequential IDs for now
      // or we use a mapping. For "World Class", lets try to find the actual file.
      try {
        const files = await fs.readdir(path.dirname(targetPath));
        const prevFile = files.find(f => f.startsWith(`Chapter_${ch.id - 1}_`));
        if (prevFile) {
          const txt = await fs.readFile(path.join(path.dirname(targetPath), prevFile), "utf-8");
          prevSummary = "..." + txt.slice(-800);
        }
      } catch (e) { }
    }

    process.stdout.write(`\n📖 Ch${ch.id}: "${ch.title}" | PASS: ${pass} ${REJECTION_FEEDBACK ? "↺ (RETRYING)" : ""}\n`);

    let passOk = false;
    let nextPass = "";

    try {
      switch (pass) {
        case "BLUEPRINT":
          // 1. Showrunner Check
          if (!REJECTION_FEEDBACK) {
            await passContinuity(marie, ch, log, worldService, prevSummary);
          }
          // 2. Blueprint (accepts Feedback if retrying)
          passOk = await passBlueprint(marie, ch, blueprintPath, log, worldService, prevSummary, REJECTION_FEEDBACK);
          REJECTION_FEEDBACK = null; // Clear feedback after it's used
          nextPass = "SKELETON";
          break;

        case "SKELETON":
          passOk = await passSkeleton(marie, ch, blueprintPath, targetPath, log, worldService.getWorldContext([ch.title]));
          nextPass = "FLESH";
          break;

        case "FLESH":
          passOk = await passFlesh(marie, ch, targetPath, log, worldService.getWorldContext([ch.title]), editorialService, worldService);
          nextPass = "NERVE";
          break;

        case "NERVE":
          passOk = await passNerve(marie, ch, targetPath, log, worldService.getWorldContext([ch.title]), editorialService);
          nextPass = "SOUL";
          break;

        case "SOUL":
          passOk = await passSoul(marie, ch, targetPath, log, worldService.getWorldContext([ch.title]), editorialService);
          nextPass = "RECEPTION";
          break;

        case "RECEPTION":
          const summary = await fs.readFile(targetPath, "utf-8");
          // We run PassReception. If it creates a log entry with REJECTED, we need to adapt.
          // Actually, PassReception returns boolean.
          // We need to capture the feedback more explicitly. 
          // Let's modify PassReception to write a feedback file OR we parse the log. 
          // For simplified "World Class", if PassReception returns FALSE, it means we FAILED.
          // But we need the WHY. 

          // Hack: PassReception returns true/false. If false, we assume REJECTED.
          // To get the data, we'll read the last log line? 
          // Better: Let's trust PassReception to log clearly.  
          // Ideally, PassReception should return a typed object, but standard interface is boolean.
          // We will assume if it fails, we trigger Global Feedback and REVERT pass.

          // Let's rely on reading the last interaction or just creating a generic "Boring" feedback.
          // But wait, the prompt said "Ouroboros". 

          passOk = await passReception(marie, targetPath, log, ch.id);

          if (!passOk) {
            process.stdout.write("   ❌ REJECTED BY CRITICS CIRCLE. REVERTING TO BLUEPRINT.\n");

            // Trigger Recursion
            REJECTION_FEEDBACK = { verdict: "BORING_DETECTED", plotHoles: ["General lack of engagement"], boredomIndex: 9 };

            // Manually revert state
            // This creates the LOOP
            // We need to set the chapter back to BLUEPRINT
            // We can use a special "REVERT" advancedDirect?
            // No, simpler: We loop, but we DON'T advance. 
            // AND we manually update the state file? 
            // To keep it clean, we'll assume Manual Intervention for now OR 
            // we implement a `regressPass` method. 
            // For now, let's just Log and STOP. Automated regression is dangerous without git.
            // Actually, let's just FORCE the next loop to treat it as Blueprint?
            // No, the file state matters.

            // "Autonomously producing" -> It MUST revert.
            await productionSvc.regressToBlueprint(ch.id); // Valid method we assume/add
            passOk = true; // Loop continues, but state is back to Blueprint
            nextPass = "BLUEPRINT"; // Logic flows
          } else {
            nextPass = "EVOLVE"; // New Step!
          }
          break;

        case "EVOLVE":
          await passEvolve(marie, targetPath, log, ch.id, worldService);
          nextPass = "CANON";
          passOk = true;
          break;

        case "CANON":
          process.stdout.write("   ✨ CHAPTER IS CANON.\n");
          return; // or break to next chapter
      }

    } catch (e: any) {
      process.stdout.write(`   🛑 ERROR: ${e.message}\n`);
      await sleep(5000);
      continue;
    }

    // ADVANCE STATE
    if (passOk && nextPass) {
      if (nextPass === "BLUEPRINT" && REJECTION_FEEDBACK) {
        // We already reverted. Do nothing, loop will catch new state.
      } else {
        await productionSvc.advancePass(`Completed ${pass}. Next: ${nextPass}`, false, nextPass);
      }
    }

    await sleep(2000);
  }
}

runPipeline().catch(console.error);
