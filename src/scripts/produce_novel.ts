#!/usr/bin/env node
import { MarieCLI } from "../monolith/adapters/CliMarieAdapter.js";
import { NovelProductionService } from "../monolith/infrastructure/ai/narrative/NovelProductionService.js";
import * as fs from "fs/promises";
import * as path from "path";

// ─── Helpers ──────────────────────────────────────────────────

function countWords(text: string): number {
  return text.split(/\s+/).filter((w) => w.length > 0).length;
}

async function readFileOrEmpty(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, "utf-8");
  } catch {
    return "";
  }
}

// ─── Word Count Targets Per Pass ──────────────────────────────

const PASS_TARGETS: Record<string, { min: number; maxTurns: number }> = {
  SKELETON: { min: 500, maxTurns: 1 },
  FLESH: { min: 2000, maxTurns: 6 },
  NERVE: { min: 3000, maxTurns: 4 },
  SOUL: { min: 3000, maxTurns: 3 },
};

// ─── Main ─────────────────────────────────────────────────────

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
    process.stdout.write("🚀 Initializing novel from outline...\n");
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
        `❌ Failed to initialize: ${err.message}\n`,
      );
      process.exit(1);
    }
  }

  // 2. Production Loop (one iteration per chapter×pass)
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

    const activeVol = structure.volumes.find((v: any) => v.status === "DRAFT");
    if (!activeVol) {
      process.stdout.write("🏁 Production complete — no draft volumes.\n");
      break;
    }

    const activeChap = activeVol.chapters.find(
      (c: any) => c.currentPass !== "CANON",
    );
    if (!activeChap) {
      process.stdout.write("🏁 All chapters are Canon. Production complete!\n");
      break;
    }

    const currentPass = activeChap.currentPass as string;
    const passConfig = PASS_TARGETS[currentPass] || { min: 500, maxTurns: 1 };

    const sanitizedTitle = activeChap.title.replace(/[^a-zA-Z0-9]/g, "_");
    const filename = `Chapter_${activeChap.id}_${sanitizedTitle}.md`;
    const targetPath = path.join(
      workingDir,
      ".vault",
      "novel",
      "chapters",
      filename,
    );
    await fs.mkdir(path.dirname(targetPath), { recursive: true });

    process.stdout.write(
      `\n${"═".repeat(67)}\n`,
    );
    process.stdout.write(
      `📖 Chapter ${activeChap.id}: "${activeChap.title}"\n`,
    );
    process.stdout.write(
      `🛠️  Pass: ${currentPass} (${activeChap.completedPasses.length + 1}/5)\n`,
    );
    process.stdout.write(
      `🎯 Target: ${passConfig.min}+ words | Max turns: ${passConfig.maxTurns}\n`,
    );
    process.stdout.write(
      `${"═".repeat(67)}\n\n`,
    );

    // ─── Inner Turn Loop ──────────────────────────────────────
    // Each pass may take multiple agent turns to build up content.
    // The script checks word count after each turn and sends
    // increasingly specific instructions.

    let turnCount = 0;
    let passAdvanced = false;

    while (turnCount < passConfig.maxTurns && !passAdvanced) {
      turnCount++;
      const existingContent = await readFileOrEmpty(targetPath);
      const currentWordCount = countWords(existingContent);

      process.stdout.write(
        `\n── Turn ${turnCount}/${passConfig.maxTurns} | Current: ${currentWordCount} words | Target: ${passConfig.min}+ ──\n\n`,
      );

      const prompt = buildPrompt(
        activeChap,
        currentPass,
        targetPath,
        turnCount,
        passConfig.maxTurns,
        currentWordCount,
        passConfig.min,
      );

      try {
        await marie.handleMessage(prompt, {
          onStream: (chunk) => process.stdout.write(chunk),
          onTool: (tool) =>
            process.stdout.write(`\n🛠️ Tool: ${tool.name}\n`),
          onEvent: (event) => {
            if (event.type === "reasoning")
              process.stdout.write(`\n💭 ${event.text}\n`);
            if (event.type === "run_error")
              process.stderr.write(`\n❌ Error: ${event.message}\n`);
          },
        });
      } catch (err: any) {
        process.stderr.write(`\n❌ Turn failed: ${err.message}\n`);
      }

      // Check if the pass was advanced by the agent
      try {
        const updatedData = await fs.readFile(novelStructurePath, "utf-8");
        const updatedStructure = JSON.parse(updatedData);
        const updatedVol = updatedStructure.volumes.find(
          (v: any) => v.id === activeVol.id,
        );
        const updatedChap = updatedVol.chapters.find(
          (c: any) => c.id === activeChap.id,
        );

        if (updatedChap.currentPass !== currentPass) {
          passAdvanced = true;
          process.stdout.write(
            `\n✨ Advanced: ${currentPass} -> ${updatedChap.currentPass}.\n`,
          );
        }
      } catch {
        // Ignore read errors, will retry
      }

      // If not advanced yet and we have more turns, check word count
      if (!passAdvanced) {
        const updatedContent = await readFileOrEmpty(targetPath);
        const updatedWordCount = countWords(updatedContent);
        process.stdout.write(
          `\n📊 After turn ${turnCount}: ${updatedWordCount} words (target: ${passConfig.min}+)\n`,
        );

        // If we've hit the word target on the last turn (or exceeded max turns),
        // nudge the agent to advance
        if (
          updatedWordCount >= passConfig.min &&
          turnCount >= passConfig.maxTurns - 1
        ) {
          process.stdout.write(
            `\n🏁 Word target met! Next turn will finalize and advance.\n`,
          );
        }
      }

      // Brief cooldown between turns
      if (!passAdvanced && turnCount < passConfig.maxTurns) {
        process.stdout.write("⏸️ Cooling down for 5 seconds...\n");
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }

    // If the pass didn't advance after all turns, nudge
    if (!passAdvanced) {
      process.stdout.write(
        `\n⚠️ Pass did not advance after ${turnCount} turns. Nudging...\n`,
      );
      try {
        await marie.handleMessage(
          `You have written content for this pass but did not call 'advance_novel_pass'. Call it NOW with a summary of what you accomplished. Then STOP.`,
          {
            onStream: (chunk) => process.stdout.write(chunk),
            onTool: (tool) =>
              process.stdout.write(`\n🛠️ Tool (Nudge): ${tool.name}\n`),
            onEvent: (event) => {
              if (event.type === "reasoning")
                process.stdout.write(`\n💭 ${event.text}\n`);
            },
          },
        );
      } catch (err: any) {
        process.stderr.write(`\n❌ Nudge failed: ${err.message}\n`);
      }
    }

    process.stdout.write("⏸️ Cooling down for 10 seconds...\n");
    await new Promise((resolve) => setTimeout(resolve, 10000));
  }

  process.stdout.write("\n✨ Novel production finished.\n");
}

// ─── Prompt Builder ───────────────────────────────────────────
// Generates turn-aware prompts that instruct the agent to write
// incrementally (append/expand) rather than all-at-once.

function buildPrompt(
  chapter: any,
  pass: string,
  targetPath: string,
  turnNumber: number,
  maxTurns: number,
  currentWordCount: number,
  targetWordCount: number,
): string {
  const isLastTurn = turnNumber >= maxTurns;
  const wordsNeeded = Math.max(0, targetWordCount - currentWordCount);
  const advanceInstruction = isLastTurn
    ? `\nAfter writing, call advance_novel_pass with a summary. Then IMMEDIATELY STOP.`
    : `\nDo NOT call advance_novel_pass yet — there are more turns remaining. Just write and stop.`;

  // ─── SKELETON ───────────────────────────────────────────────
  if (pass === "SKELETON") {
    return `Write the SKELETON outline for Chapter ${chapter.id}: "${chapter.title}".
Description: ${chapter.description}
TARGET FILE: ${targetPath}

Create a rich chapter blueprint with:
- Scene-by-scene breakdown with setting descriptions
- Character entrances with physical/emotional details
- Key dialogue beats as actual lines
- Thematic hooks and foreshadowing seeds
- World-building notes

Write the outline to the TARGET FILE using 'write_to_file'.
Then call advance_novel_pass with a summary. Then STOP.`;
  }

  // ─── FLESH ──────────────────────────────────────────────────
  if (pass === "FLESH") {
    if (turnNumber === 1) {
      // First turn: Read skeleton, write opening scenes as prose
      return `FLESH PASS — Turn ${turnNumber}/${maxTurns} for Chapter ${chapter.id}: "${chapter.title}".
TARGET FILE: ${targetPath}

You are the NOVELIST. Transform the skeleton into prose fiction.

STEP 1: Read the existing file using 'read_file' — it contains a skeleton outline.
STEP 2: Write the OPENING of the chapter as full narrative prose:
  - Write a gripping opening paragraph (the hook)
  - Expand the FIRST 1-2 scenes into vivid, immersive fiction
  - Include sensory detail, dialogue with beats, internal monologue
  - Write at least 500 words of actual prose (not bullet points)
STEP 3: OVERWRITE the file with your prose using 'write_to_file'.

You are building the chapter incrementally. This is turn ${turnNumber} of ${maxTurns}.
Focus on QUALITY over trying to cover everything. Write the opening scenes beautifully.
${advanceInstruction}`;
    } else if (currentWordCount < targetWordCount) {
      // Middle turns: Continue writing the next scenes
      return `FLESH PASS — Turn ${turnNumber}/${maxTurns} for Chapter ${chapter.id}: "${chapter.title}".
TARGET FILE: ${targetPath}
Current progress: ${currentWordCount} words (target: ${targetWordCount}+)

STEP 1: Read the existing file — it contains prose you've already written.
STEP 2: CONTINUE the narrative. Write the NEXT scenes that haven't been covered yet.
  - Read what you've written so far
  - Pick up where the narrative left off
  - Write 500-800 more words of prose continuing the story
  - Include dialogue, description, and character interiority
STEP 3: Write the COMPLETE chapter (existing content + new content) to the file using 'write_to_file'.

IMPORTANT: Do NOT rewrite what already exists. READ it, then APPEND new scenes after it.
${advanceInstruction}`;
    } else {
      // Target met, finalize
      return `FLESH PASS — FINAL Turn ${turnNumber}/${maxTurns} for Chapter ${chapter.id}: "${chapter.title}".
TARGET FILE: ${targetPath}
Current progress: ${currentWordCount} words ✓

The prose is sufficient. Read the file, make any final smoothing edits, then call advance_novel_pass with a summary. Then STOP.`;
    }
  }

  // ─── NERVE ──────────────────────────────────────────────────
  if (pass === "NERVE") {
    if (currentWordCount < targetWordCount) {
      return `NERVE PASS — Turn ${turnNumber}/${maxTurns} for Chapter ${chapter.id}: "${chapter.title}".
TARGET FILE: ${targetPath}
Current progress: ${currentWordCount} words (target: ${targetWordCount}+)

You are the EDITOR OF TENSION. Your job is to DEEPEN and EXPAND existing prose.

STEP 1: Read the existing chapter file.
STEP 2: Find the thinnest or weakest section and EXPAND it with:
  - Deeper sensory details (add a new sense to each scene)
  - Subtext in dialogue (characters meaning more than they say)
  - Internal conflict moments (character doubts, fears, desires)
  - Environmental reactions (weather, light, ambient sound shifting with mood)
  - Add 300-500 new words woven into the existing text
STEP 3: Write the expanded chapter to the file using 'write_to_file'.

Do NOT delete or shorten existing prose. Only ADD to it.
${advanceInstruction}`;
    } else {
      return `NERVE PASS — FINAL Turn ${turnNumber}/${maxTurns} for Chapter ${chapter.id}: "${chapter.title}".
TARGET FILE: ${targetPath}
Current progress: ${currentWordCount} words ✓

Read the file, ensure tension and depth are strong, then call advance_novel_pass with a summary. Then STOP.`;
    }
  }

  // ─── SOUL ───────────────────────────────────────────────────
  return `SOUL PASS — Turn ${turnNumber}/${maxTurns} for Chapter ${chapter.id}: "${chapter.title}".
TARGET FILE: ${targetPath}
Current progress: ${currentWordCount} words

You are the LITERARY ALCHEMIST. Polish to publishable quality.

STEP 1: Read the existing chapter file.
STEP 2: Polish and refine:
  - Strengthen the opening hook
  - Sharpen metaphors (replace clichés with original imagery)
  - Ensure consistent narrative voice
  - Weave thematic motifs (recurring images, echoed phrases)
  - Smooth transitions between scenes
  - Craft a compelling closing line
  - Do NOT shorten the chapter
STEP 3: Write the polished chapter to the file using 'write_to_file'.

After polishing, call advance_novel_pass with a summary. Then STOP.`;
}

main().catch((err) => {
  process.stderr.write(
    `\n💥 Fatal: ${err.message || err}\n`,
  );
  if (err.stack) process.stderr.write(`${err.stack}\n`);
  process.exit(1);
});
