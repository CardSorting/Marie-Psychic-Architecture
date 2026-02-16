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

// ═══════════════════════════════════════════════════════════════
//  MAIN
// ═══════════════════════════════════════════════════════════════

async function advanceDirect(
  workingDir: string,
  log: Log,
  ch: any,
  pass: string,
  summary: string,
  force: boolean = false,
): Promise<{ success: boolean; message: string }> {
  try {
    const svc = new NovelProductionService(workingDir);
    await svc.initialize();
    const result = await svc.advancePass(summary, force);
    if (result.success) await log.write(ch.id, pass, `✅ ADVANCED: ${result.message}`);
    else await log.write(ch.id, pass, `⚠️ Rejected: ${result.message}`);
    return result;
  } catch (err: any) {
    return { success: false, message: err.message };
  }
}

async function main() {
  const workingDir = process.cwd();
  const log = new Log(workingDir);
  const worldService = new WorldService(workingDir);
  const editorialService = new EditorialService();
  await worldService.initialize();

  process.stdout.write("🔮 Novel Pipeline v5 — SENIOR EDITORIAL GRADE\n\n");

  let marie: MarieCLI;
  try {
    marie = new MarieCLI(workingDir);
    process.stdout.write("✅ MarieCLI initialized.\n");
  } catch (err: any) {
    process.stderr.write(`❌ MarieCLI: ${err.message}\n`);
    process.exit(1);
  }

  const productionSvc = new NovelProductionService(workingDir);
  await productionSvc.initialize();

  const attempts = new Map<string, number>();

  while (true) {
    // Reload structure every loop
    await productionSvc.initialize();
    // Access private structure via any casting hack for read-loop
    const structure = (productionSvc as any).structure;

    if (!structure || !structure.volumes) break;

    const vol = structure.volumes.find((v: any) => v.status === "DRAFT");
    if (!vol) break;
    const ch = vol.chapters.find((c: any) => c.currentPass !== "CANON");
    if (!ch) break;

    const pass = ch.currentPass as string;
    const key = `${ch.id}:${pass}`;
    const attempt = (attempts.get(key) || 0) + 1;
    attempts.set(key, attempt);

    if (attempt > 3) {
      await log.write(ch.id, pass, `CIRCUIT BREAKER: Force-advance.`);
      await advanceDirect(workingDir, log, ch, pass, `FORCED after ${attempt} attempts.`, true);
      attempts.delete(key);
      continue;
    }

    const chapFileName = `Chapter_${ch.id}_${ch.title.replace(/[^a-zA-Z0-9]/g, "_")}`;
    const targetPath = path.join(workingDir, ".vault", "novel", "chapters", `${chapFileName}.md`);
    const blueprintPath = path.join(workingDir, ".vault", "novel", "chapters", `${chapFileName}_Blueprint.json`);

    await fs.mkdir(path.dirname(targetPath), { recursive: true });

    const lore = worldService.getWorldContext([ch.title]);

    // ─── COHERENCE LINKING ───
    let prevSummary = "Start of Volume.";
    const prevChIndex = vol.chapters.findIndex((c: any) => c.id === ch.id) - 1;
    if (prevChIndex >= 0) {
      const prevCh = vol.chapters[prevChIndex];
      const prevChapFileName = `Chapter_${prevCh.id}_${prevCh.title.replace(/[^a-zA-Z0-9]/g, "_")}`;
      const prevPath = path.join(workingDir, ".vault", "novel", "chapters", `${prevChapFileName}.md`);
      try {
        const prevText = await fs.readFile(prevPath, "utf-8");
        // Extract last 500 words
        const words = prevText.split(/\s+/);
        const tail = words.slice(-500).join(" ");
        prevSummary = `...${tail}`;
      } catch {
        prevSummary = `(Previous chapter file not found: ${prevChapFileName})`;
      }
    }

    process.stdout.write(`\n📖 Ch${ch.id}: "${ch.title}" | ${pass} | Attempt ${attempt}/3\n`);

    let passOk = false;
    try {
      switch (pass) {
        case "BLUEPRINT":
          // Run Continuity First
          process.stdout.write("   Running Continuity Check...\n");
          await passContinuity(marie, ch, log, worldService, prevSummary);
          passOk = await passBlueprint(marie, ch, blueprintPath, log, worldService, prevSummary);
          break;
        case "SKELETON":
          passOk = await passSkeleton(marie, ch, blueprintPath, targetPath, log, lore);
          break;
        case "FLESH":
          passOk = await passFlesh(marie, ch, targetPath, log, worldService.getWorldContext([ch.title]), editorialService, worldService);
          break;
        case "NERVE":
          passOk = await passNerve(marie, ch, targetPath, log, lore, editorialService);
          break;
        case "SOUL":
          passOk = await passSoul(marie, ch, targetPath, log, lore, editorialService);
          break;
        default: passOk = true;
      }
    } catch (err: any) { await log.write(ch.id, pass, `Error: ${err.message}`); }

    if (passOk) {
      const result = await advanceDirect(workingDir, log, ch, pass, `${pass} complete.`);
      if (result.success) {
        attempts.delete(key);
      }
    } else {
      await log.write(ch.id, pass, "Pass Failed. Retrying...");
      await sleep(5000);
    }
  }
}

main().catch(err => console.error(err));
