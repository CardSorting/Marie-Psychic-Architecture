#!/usr/bin/env node
import { MarieCLI } from "../monolith/adapters/CliMarieAdapter.js";
import { NovelProductionService } from "../monolith/infrastructure/ai/narrative/NovelProductionService.js";
import * as fs from "fs/promises";
import * as path from "path";

async function main() {
  const workingDir = process.cwd();
  const novelStructurePath = path.join(
    workingDir,
    ".marie",
    "novel_structure.json",
  );

  process.stdout.write("🔮 Starting Programmatic Novel Production...\n");

  let marie: MarieCLI;
  try {
    process.stdout.write("🔧 Initializing MarieCLI...\n");
    marie = new MarieCLI(workingDir);
    process.stdout.write("✅ MarieCLI initialized.\n");
  } catch (err: any) {
    process.stderr.write(`❌ Failed to initialize MarieCLI: ${err.message}\n`);
    if (err.stack) process.stderr.write(`${err.stack}\n`);
    process.exit(1);
  }

  // 1. Initialize if needed
  try {
    await fs.access(novelStructurePath);
    process.stdout.write("✅ Novel structure found.\n");
  } catch {
    process.stdout.write("🚀 Initializing novel from outline (Directly)...\n");
    try {
      const outlinePath = path.join(workingDir, "lightnovel.md");
      const outlineContent = await fs.readFile(outlinePath, "utf-8");
      const lines = outlineContent.split("\n");
      const chapters: { title: string; description: string }[] = [];
      let currentChapter: { title: string; description: string } | null = null;

      for (const line of lines) {
        const chapterMatch = line.match(/^Chapter \d+ — (.+)/);
        if (chapterMatch) {
          if (currentChapter) chapters.push(currentChapter);
          currentChapter = { title: chapterMatch[1], description: "" };
        } else if (currentChapter && line.trim() && !line.startsWith("Arc")) {
          currentChapter.description += line.trim() + " ";
        }
      }
      if (currentChapter) chapters.push(currentChapter);

      const novelService = new NovelProductionService(workingDir);
      // Re-initialize to clear the default "Genesis" chapter and build from outline
      // Note: NovelProductionService.initialize() has a catch block that creates
      // a Volume 1 with a Genesis chapter if the file is missing.
      // We want to overwrite that with our outline.

      // First, create the empty structure
      (novelService as any).structure = {
        volumes: [
          {
            id: 1,
            title: "Volume I: The Rollback",
            status: "DRAFT",
            chapters: [],
          },
        ],
      };
      await novelService.save();

      for (const chap of chapters) {
        await novelService.startNewChapter(chap.title, chap.description.trim());
      }
      process.stdout.write(
        `✅ Initialized with ${chapters.length} chapters.\n`,
      );
    } catch (err: any) {
      process.stderr.write(
        `❌ Failed to initialize directly: ${err.message}\n`,
      );
      process.exit(1);
    }
  }

  // 2. Production Loop
  while (true) {
    let structure;
    try {
      const structureData = await fs.readFile(novelStructurePath, "utf-8");
      structure = JSON.parse(structureData);
    } catch (err: any) {
      process.stderr.write(
        `❌ Failed to read novel structure: ${err.message}\n`,
      );
      process.exit(1);
    }

    // Find the first draft volume
    const activeVol = structure.volumes.find((v: any) => v.status === "DRAFT");
    if (!activeVol) {
      process.stdout.write(
        "🏁 No active draft volume found. Production complete?\n",
      );
      break;
    }

    // Find the first non-Canon chapter
    const activeChap = activeVol.chapters.find(
      (c: any) => c.currentPass !== "CANON",
    );
    if (!activeChap) {
      process.stdout.write(
        "🏁 All chapters are Canon in the active volume. Production complete!\n",
      );
      break;
    }

    process.stdout.write(
      `\n───────────────────────────────────────────────────────────────────\n`,
    );
    process.stdout.write(
      `📖 Chapter ${activeChap.id}: "${activeChap.title}"\n`,
    );
    process.stdout.write(
      `🛠️ Pass: ${activeChap.currentPass} (${activeChap.completedPasses.length + 1}/5)\n`,
    );
    process.stdout.write(
      `───────────────────────────────────────────────────────────────────\n\n`,
    );

    const sanitizedTitle = activeChap.title.replace(/[^a-zA-Z0-9]/g, "_");
    const filename = `Chapter_${activeChap.id}_${sanitizedTitle}.md`;
    const targetPath = path.join(workingDir, ".vault", "novel", "chapters", filename);

    // Ensure directory exists
    await fs.mkdir(path.dirname(targetPath), { recursive: true });

    const prompt = `Perform the ${activeChap.currentPass} pass for Chapter ${activeChap.id}: "${activeChap.title}".
Description: ${activeChap.description}
TARGET FILE: ${targetPath}

Follow the Persona Instructions for the ${activeChap.currentPass} phase.

CRITICAL INSTRUCTIONS:
1. This is a CREATION phase. The file likely does not exist.
2. DO NOT try to read the file first.
3. DO NOT check if the file exists (no list_dir, no read_file).
4. DO NOT lint.
5. GENERATE the content for the chapter based on the description.
6. WRITE the content immediately to the TARGET FILE using the 'write_to_file' tool.

When your work for this pass is complete AND verified (by writing the file), call advance_novel_pass with a summary.
Then, IMMEDIATELY STOP. Do not perform any further actions, checks, or verifications. Accessing the novel status or listing directories after advancement is strictly prohibited.`;

    try {
      await marie.handleMessage(prompt, {
        onStream: (chunk) => process.stdout.write(chunk),
        onTool: (tool) =>
          process.stdout.write(`\n🛠️ Tool Call: ${tool.name}\n`),
        onEvent: (event) => {
          if (event.type === "reasoning") {
            process.stdout.write(`\n💭 ${event.text}\n`);
          }
          if (event.type === "run_error") {
            process.stderr.write(`\n❌ Engine Error: ${event.message}\n`);
          }
        },
      });
    } catch (err: any) {
      process.stderr.write(`\n❌ Turn failed with exception: ${err.message}\n`);
      if (err.stack) process.stderr.write(`${err.stack}\n`);
    }

    process.stdout.write(
      "\n✅ Turn finished. Checking state for progression...\n",
    );

    // Check if the pass actually advanced
    try {
      const updatedData = await fs.readFile(novelStructurePath, "utf-8");
      const updatedStructure = JSON.parse(updatedData);
      const updatedVol = updatedStructure.volumes.find(
        (v: any) => v.id === activeVol.id,
      );
      const updatedChap = updatedVol.chapters.find(
        (c: any) => c.id === activeChap.id,
      );

      if (updatedChap.currentPass === activeChap.currentPass) {
        process.stdout.write(
          `⚠️ Pass did not advance. Nudging AI to complete the protocol...\n`,
        );
        try {
          await marie.handleMessage(
            "You have performed the work but failed to call 'advance_novel_pass'. You MUST call 'advance_novel_pass' with a summary NOW to proceed.",
            {
              onStream: (chunk) => process.stdout.write(chunk),
              onTool: (tool) =>
                process.stdout.write(`\n🛠️ Tool Call (Nudge): ${tool.name}\n`),
              onEvent: (event) => {
                if (event.type === "reasoning") process.stdout.write(`\n💭 ${event.text}\n`);
              }
            },
          );
        } catch (err: any) {
          process.stderr.write(`\n❌ Nudge failed: ${err.message}\n`);
        }
      } else {
        process.stdout.write(
          `✨ Advanced: ${activeChap.currentPass} -> ${updatedChap.currentPass}.\n`,
        );
      }
    } catch (err: any) {
      process.stderr.write(`❌ Failed to verify state: ${err.message}\n`);
    }

    process.stdout.write("⏸️ Cooling down for 10 seconds...\n");
    await new Promise((resolve) => setTimeout(resolve, 10000));
  }

  process.stdout.write("\n✨ Novel production finished.\n");
}

main().catch((err) => {
  process.stderr.write(
    `\n💥 Fatal Uncaught Exception: ${err.message || err}\n`,
  );
  if (err.stack) process.stderr.write(`${err.stack}\n`);
  process.exit(1);
});
