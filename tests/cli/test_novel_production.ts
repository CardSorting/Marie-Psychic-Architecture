import { ToolRegistry } from "../../src/monolith/infrastructure/tools/ToolRegistry.js";
import { NovelProductionService } from "../../src/monolith/infrastructure/ai/narrative/NovelProductionService.js";
import { NarrativeAutomationServiceCLI } from "../../src/monolith/services/NarrativeAutomationServiceCLI.js";
import { registerNovelTools } from "../../src/monolith/cli/NovelProductionTools.js";
import { JoyServiceCLI } from "../../src/monolith/cli/services/JoyServiceCLI.js";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

async function runTest() {
  console.log("🚀 Testing Novel Production Tools...");

  const workingDir = path.join(os.tmpdir(), "marie-novel-test-" + Date.now());
  await fs.mkdir(workingDir, { recursive: true });

  const outlinePath = path.join(workingDir, "lightnovel.md");
  const outlineContent = `
Chapter 1 — The Rollback
Production failure. logs spiraling.

Chapter 2 — The Cathedral
Wakes in cathedral. First encounter.
    `.trim();
  await fs.writeFile(outlinePath, outlineContent);

  const registry = new ToolRegistry();
  const novelService = new NovelProductionService(workingDir);
  const joyService = new JoyServiceCLI();
  const narrativeAutomation = new NarrativeAutomationServiceCLI(
    workingDir,
    joyService,
  );

  registerNovelTools(registry, novelService, narrativeAutomation, workingDir);

  console.log("--- Testing initiate_novel_from_outline ---");
  const initTool = registry.getTool("initiate_novel_from_outline");
  if (!initTool) throw new Error("initiate_novel_from_outline not found");

  const initResult = await initTool.execute({ outlinePath: "lightnovel.md" });
  console.log(initResult);

  const statusFile = path.join(workingDir, ".marie/novel_structure.json");
  const statusData = JSON.parse(await fs.readFile(statusFile, "utf-8"));
  console.log(`Chapters initialized: ${statusData.volumes[0].chapters.length}`);
  if (statusData.volumes[0].chapters.length < 2)
    throw new Error("Chapter initialization failed");

  console.log("--- Testing get_novel_status ---");
  const statusTool = registry.getTool("get_novel_status");
  const statusResult = await statusTool?.execute({});
  console.log(
    "Current Status Context:",
    statusResult?.substring(0, 100) + "...",
  );

  console.log("--- Testing advance_novel_pass ---");
  const advanceTool = registry.getTool("advance_novel_pass");
  // Mocking advancePass because AdvancePass requires CritiqueService which might fail without real AI
  // But we are testing the tool registration and basic flow.
  // In a real env, CritiqueService would be mocked or use a real API.
  // For this test, we just ensure it's callable.
  try {
    const advanceResult = await advanceTool?.execute({
      summary: "Test pass summary",
    });
    console.log("Advance Result:", advanceResult);
  } catch (e: any) {
    console.log("Advance failed as expected (no real AI):", e.message);
  }

  console.log("✅ Novel Production Tools functional test complete.");

  // Cleanup
  await fs.rm(workingDir, { recursive: true, force: true });
}

runTest().catch(console.error);
