#!/usr/bin/env node
/**
 * Novel Production Pipeline — Section-by-Section Assembly
 *
 * Strategy: The SCRIPT manages file construction.
 * Each agent turn writes ONE scene (~500 words).
 * The script parses, dispatches, concatenates, and advances.
 */
import { MarieCLI } from "../monolith/adapters/CliMarieAdapter.js";
import { NovelProductionService } from "../monolith/infrastructure/ai/narrative/NovelProductionService.js";
import * as fs from "fs/promises";
import * as path from "path";

// ─── Types ────────────────────────────────────────────────────

interface Scene {
  id: number;
  title: string;
  notes: string; // The raw skeleton text for this scene
}

interface ProductionLog {
  timestamp: string;
  chapter: number;
  pass: string;
  event: string;
  wordCount?: number;
}

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

/** Parse a skeleton file into individual scenes */
function parseScenes(skeletonContent: string): Scene[] {
  const scenes: Scene[] = [];
  const lines = skeletonContent.split("\n");
  let currentScene: Scene | null = null;

  for (const line of lines) {
    // Match **Scene N: Title** or **Scene N — Title**
    const sceneMatch = line.match(
      /\*\*Scene\s+(\d+)\s*[:—–-]\s*(.+?)\*\*/i,
    );
    if (sceneMatch) {
      if (currentScene) scenes.push(currentScene);
      currentScene = {
        id: parseInt(sceneMatch[1]),
        title: sceneMatch[2].trim(),
        notes: line + "\n",
      };
    } else if (currentScene) {
      // Stop collecting if we hit another ## Act header or thematic section
      if (
        line.startsWith("## ") ||
        line.startsWith("**Chapter Thematic") ||
        line.startsWith("**Foreshadowing Arc") ||
        line.startsWith("**Character Arcs")
      ) {
        scenes.push(currentScene);
        currentScene = null;
      } else {
        currentScene.notes += line + "\n";
      }
    }
  }
  if (currentScene) scenes.push(currentScene);
  return scenes;
}

/** Extract thematic context from the skeleton (non-scene sections) */
function extractThematicContext(skeletonContent: string): string {
  const lines = skeletonContent.split("\n");
  const thematic: string[] = [];
  let inThematic = false;
  for (const line of lines) {
    if (
      line.startsWith("**Chapter Thematic") ||
      line.startsWith("**Foreshadowing") ||
      line.startsWith("**Character Arcs")
    ) {
      inThematic = true;
    }
    if (inThematic) thematic.push(line);
  }
  return thematic.join("\n").trim();
}

// ─── Production Logger ────────────────────────────────────────

class ProductionLogger {
  private logPath: string;
  private entries: ProductionLog[] = [];

  constructor(workingDir: string) {
    this.logPath = path.join(
      workingDir,
      ".vault",
      "novel",
      "production.log",
    );
  }

  async log(
    chapter: number,
    pass: string,
    event: string,
    wordCount?: number,
  ) {
    const entry: ProductionLog = {
      timestamp: new Date().toISOString(),
      chapter,
      pass,
      event,
      wordCount,
    };
    this.entries.push(entry);
    const line = `[${entry.timestamp}] Ch${chapter}/${pass}: ${event}${wordCount !== undefined ? ` (${wordCount} words)` : ""
      }\n`;
    process.stdout.write(`📝 ${line}`);
    try {
      await fs.mkdir(path.dirname(this.logPath), { recursive: true });
      await fs.appendFile(this.logPath, line);
    } catch {
      // Non-fatal
    }
  }
}

// ─── Agent Interaction ────────────────────────────────────────

async function callAgent(
  marie: MarieCLI,
  prompt: string,
): Promise<void> {
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
}

/** Call agent with stall detection + retry */
async function callAgentWithRetry(
  marie: MarieCLI,
  prompt: string,
  outputPath: string,
  logger: ProductionLogger,
  chapter: number,
  pass: string,
  label: string,
  maxRetries: number = 2,
): Promise<number> {
  const beforeContent = await readFileOrEmpty(outputPath);
  const beforeWords = countWords(beforeContent);

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await callAgent(
        marie,
        attempt === 1
          ? prompt
          : `${prompt}\n\nIMPORTANT: Your previous attempt produced no output. You MUST write content to the file. Just write — do not overthink.`,
      );
    } catch (err: any) {
      await logger.log(chapter, pass, `${label}: Error — ${err.message}`);
    }

    const afterContent = await readFileOrEmpty(outputPath);
    const afterWords = countWords(afterContent);
    const growth = afterWords - beforeWords;

    if (growth > 50) {
      await logger.log(
        chapter,
        pass,
        `${label}: +${growth} words`,
        afterWords,
      );
      return afterWords;
    }

    if (attempt < maxRetries) {
      await logger.log(
        chapter,
        pass,
        `${label}: Stall detected (${growth} words). Retry ${attempt + 1}/${maxRetries}`,
      );
      await new Promise((r) => setTimeout(r, 3000));
    }
  }

  await logger.log(
    chapter,
    pass,
    `${label}: Failed after ${maxRetries} attempts. Moving on.`,
  );
  return countWords(await readFileOrEmpty(outputPath));
}

// ─── Pass Implementations ─────────────────────────────────────

async function runSkeletonPass(
  marie: MarieCLI,
  chapter: any,
  targetPath: string,
  logger: ProductionLogger,
): Promise<void> {
  await logger.log(chapter.id, "SKELETON", "Starting skeleton pass");

  const prompt = `Write the SKELETON outline for Chapter ${chapter.id}: "${chapter.title}".
Description: ${chapter.description}
TARGET FILE: ${targetPath}

Create a rich chapter blueprint with:
- Scene-by-scene breakdown using **Scene N: Title** format (this format is CRITICAL)
- Each scene should have: Setting, Character details, Dialogue beats, Sensory details
- Thematic hooks and foreshadowing seeds
- World-building notes

FORMAT (follow this EXACTLY):
## Act 1: [Act Title]

**Scene 1: [Title]**
- **Setting**: [description]
- **Character**: [details]
- **Dialogue Beat**: [key lines]
- **Sensory Detail**: [sights, sounds, smells]

**Scene 2: [Title]**
...

Write the outline to the TARGET FILE using 'write_to_file'.
Then call advance_novel_pass with a summary. Then STOP.`;

  await callAgentWithRetry(
    marie,
    prompt,
    targetPath,
    logger,
    chapter.id,
    "SKELETON",
    "Outline",
  );
}

async function runFleshPass(
  marie: MarieCLI,
  chapter: any,
  targetPath: string,
  workingDir: string,
  logger: ProductionLogger,
  previousChapterSummaries: string,
): Promise<void> {
  await logger.log(chapter.id, "FLESH", "Starting FLESH pass — scene-by-scene assembly");

  // 1. Read and parse the skeleton
  const skeletonContent = await readFileOrEmpty(targetPath);
  const scenes = parseScenes(skeletonContent);
  const thematicContext = extractThematicContext(skeletonContent);

  if (scenes.length === 0) {
    await logger.log(
      chapter.id,
      "FLESH",
      "WARNING: No scenes found in skeleton. Treating entire file as one scene.",
    );
    scenes.push({
      id: 1,
      title: "Full Chapter",
      notes: skeletonContent,
    });
  }

  await logger.log(
    chapter.id,
    "FLESH",
    `Found ${scenes.length} scenes to write`,
  );

  // 2. Create temp directory for scene files
  const tempDir = path.join(workingDir, ".vault", "novel", "temp");
  await fs.mkdir(tempDir, { recursive: true });

  // 3. Write each scene as a separate agent turn
  for (const scene of scenes) {
    const sceneFile = path.join(
      tempDir,
      `ch${chapter.id}_scene_${scene.id}.md`,
    );

    const prompt = `Write PROSE for Scene ${scene.id} of Chapter ${chapter.id}: "${chapter.title}".

TARGET FILE: ${sceneFile}

${previousChapterSummaries ? `PREVIOUS CHAPTERS:\n${previousChapterSummaries}\n` : ""}
THEMATIC CONTEXT:
${thematicContext || "No thematic notes."}

SCENE NOTES TO EXPAND:
${scene.notes.trim()}

INSTRUCTIONS:
- Write 400-600 words of immersive fiction for THIS SCENE ONLY
- Include vivid sensory detail (sights, sounds, smells, textures)
- Write actual dialogue with action beats and subtext
- Include character interiority (thoughts, feelings, reactions)
- Use varied sentence structures
- DO NOT write headers or metadata — just pure prose paragraphs
- DO NOT write other scenes — ONLY Scene ${scene.id}: "${scene.title}"

Write the prose to the TARGET FILE using 'write_to_file'. Then STOP.
Do NOT call advance_novel_pass — the production system will handle that.`;

    await callAgentWithRetry(
      marie,
      prompt,
      sceneFile,
      logger,
      chapter.id,
      "FLESH",
      `Scene ${scene.id}: ${scene.title}`,
    );

    // Brief cooldown between scenes
    await new Promise((r) => setTimeout(r, 3000));
  }

  // 4. Concatenate all scene files into the chapter
  await logger.log(chapter.id, "FLESH", "Concatenating scenes...");
  const chapterParts: string[] = [
    `# Chapter ${chapter.id}: ${chapter.title}\n\n`,
  ];

  for (const scene of scenes) {
    const sceneFile = path.join(
      tempDir,
      `ch${chapter.id}_scene_${scene.id}.md`,
    );
    const sceneContent = await readFileOrEmpty(sceneFile);
    if (sceneContent.trim()) {
      chapterParts.push(`## Scene ${scene.id}: ${scene.title}\n\n`);
      chapterParts.push(sceneContent.trim() + "\n\n---\n\n");
    }
  }

  const finalChapter = chapterParts.join("");
  await fs.writeFile(targetPath, finalChapter);

  const totalWords = countWords(finalChapter);
  await logger.log(
    chapter.id,
    "FLESH",
    `Assembly complete`,
    totalWords,
  );

  // 5. Clean up temp files
  for (const scene of scenes) {
    const sceneFile = path.join(
      tempDir,
      `ch${chapter.id}_scene_${scene.id}.md`,
    );
    try {
      await fs.unlink(sceneFile);
    } catch {
      // Non-fatal
    }
  }
}

async function runNervePass(
  marie: MarieCLI,
  chapter: any,
  targetPath: string,
  logger: ProductionLogger,
): Promise<void> {
  await logger.log(chapter.id, "NERVE", "Starting NERVE pass — section expansion");

  const content = await readFileOrEmpty(targetPath);
  const totalWords = countWords(content);
  const targetGrowth = Math.ceil(totalWords * 0.3);
  const targetTotal = totalWords + targetGrowth;

  await logger.log(
    chapter.id,
    "NERVE",
    `Current: ${totalWords} words. Target: ${targetTotal} (+${targetGrowth})`,
  );

  // Split into sections by ## headers or ---
  const sections = content.split(/(?=## Scene )/);
  const sectionsToExpand = sections.filter((s) => countWords(s) > 50);

  // Expand each section
  for (let i = 0; i < sectionsToExpand.length; i++) {
    const section = sectionsToExpand[i];
    const sectionWords = countWords(section);
    const firstLine = section.split("\n").find((l) => l.trim()) || `Section ${i + 1}`;

    const prompt = `NERVE PASS: Deepen and expand this section of Chapter ${chapter.id}: "${chapter.title}".
TARGET FILE: ${targetPath}

Read the existing chapter file. Find the section starting with: "${firstLine.trim().substring(0, 80)}"

EXPAND that section by adding 200-400 NEW words woven into it:
- Deepen sensory layers (add a new sense: smell, texture, temperature)
- Add subtext to any dialogue (characters mean more than they say)
- Insert a moment of internal conflict or doubt
- Add environmental storytelling (world reacts to mood)
- Weave in a foreshadowing detail

RULES:
- Do NOT delete or shorten any existing text
- Do NOT rewrite from scratch — ADD to what exists
- Write the ENTIRE updated chapter back to the file using 'write_to_file'
- Then STOP. Do NOT call advance_novel_pass.`;

    await callAgentWithRetry(
      marie,
      prompt,
      targetPath,
      logger,
      chapter.id,
      "NERVE",
      `Expanding: ${firstLine.trim().substring(0, 40)}`,
    );

    await new Promise((r) => setTimeout(r, 3000));
  }

  const finalWords = countWords(await readFileOrEmpty(targetPath));
  await logger.log(
    chapter.id,
    "NERVE",
    `Expansion complete: ${totalWords} → ${finalWords} words (+${finalWords - totalWords})`,
    finalWords,
  );
}

async function runSoulPass(
  marie: MarieCLI,
  chapter: any,
  targetPath: string,
  logger: ProductionLogger,
): Promise<void> {
  await logger.log(chapter.id, "SOUL", "Starting SOUL pass — polish");

  const prompt = `SOUL PASS: Polish Chapter ${chapter.id}: "${chapter.title}" to publishable quality.
TARGET FILE: ${targetPath}

Read the existing chapter file.

POLISH:
- Strengthen the opening paragraph — make it a hook that grabs the reader
- Refine metaphors and similes (replace clichés with original imagery)
- Ensure consistent narrative voice throughout
- Smooth transitions between scenes
- Craft a compelling closing line (cliffhanger, revelation, or emotional resonance)
- Vary paragraph length for rhythm
- Fix any awkward phrasing or redundancies

RULES:
- Do NOT shorten the chapter — maintain or increase word count
- Do NOT remove scenes, dialogue, or descriptions
- Write the polished chapter to the file using 'write_to_file'
- Then STOP. Do NOT call advance_novel_pass.`;

  await callAgentWithRetry(
    marie,
    prompt,
    targetPath,
    logger,
    chapter.id,
    "SOUL",
    "Polish",
  );

  const finalWords = countWords(await readFileOrEmpty(targetPath));
  await logger.log(chapter.id, "SOUL", `Polish complete`, finalWords);
}

// ─── Main ─────────────────────────────────────────────────────

async function main() {
  const workingDir = process.cwd();
  const novelStructurePath = path.join(
    workingDir,
    ".marie",
    "novel_structure.json",
  );
  const logger = new ProductionLogger(workingDir);

  process.stdout.write("🔮 Starting Novel Production Pipeline...\n");

  // Initialize MarieCLI
  let marie: MarieCLI;
  try {
    marie = new MarieCLI(workingDir);
    process.stdout.write("✅ MarieCLI initialized.\n");
  } catch (err: any) {
    process.stderr.write(`❌ Failed to initialize MarieCLI: ${err.message}\n`);
    process.exit(1);
  }

  // Initialize novel structure if needed
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
      process.stdout.write(`✅ Initialized ${chapters.length} chapters.\n`);
    } catch (err: any) {
      process.stderr.write(`❌ Init failed: ${err.message}\n`);
      process.exit(1);
    }
  }

  // ─── Production Loop ────────────────────────────────────────
  const attemptMap = new Map<string, number>();

  while (true) {
    let structure;
    try {
      structure = JSON.parse(
        await fs.readFile(novelStructurePath, "utf-8"),
      );
    } catch (err: any) {
      process.stderr.write(`❌ Failed to read structure: ${err.message}\n`);
      process.exit(1);
    }

    const activeVol = structure.volumes.find((v: any) => v.status === "DRAFT");
    if (!activeVol) {
      process.stdout.write("🏁 No draft volumes. Production complete.\n");
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

    // Circuit breaker
    const attemptKey = `${activeChap.id}:${currentPass}`;
    const attemptCount = (attemptMap.get(attemptKey) || 0) + 1;
    attemptMap.set(attemptKey, attemptCount);

    if (attemptCount > 3) {
      await logger.log(
        activeChap.id,
        currentPass,
        `CIRCUIT BREAKER: ${attemptCount} attempts. Force-advancing.`,
      );
      try {
        const forceService = new NovelProductionService(workingDir);
        await forceService.initialize();
        await forceService.advancePass(
          `FORCED after ${attemptCount} failed attempts.`,
        );
        attemptMap.delete(attemptKey);
        continue;
      } catch (err: any) {
        process.stderr.write(`❌ Force-advance failed: ${err.message}\n`);
        break;
      }
    }

    // Build previous chapter summaries for continuity
    const previousSummaries = activeVol.chapters
      .filter((c: any) => c.id < activeChap.id && c.continuityLedger.length > 0)
      .map(
        (c: any) =>
          `Ch${c.id} "${c.title}": ${c.continuityLedger[c.continuityLedger.length - 1]?.summary || ""}`,
      )
      .join("\n");

    process.stdout.write(
      `\n${"═".repeat(67)}\n`,
    );
    process.stdout.write(
      `📖 Chapter ${activeChap.id}: "${activeChap.title}"\n`,
    );
    process.stdout.write(
      `🛠️  Pass: ${currentPass} | Attempt ${attemptCount}/3\n`,
    );
    process.stdout.write(`${"═".repeat(67)}\n\n`);

    // ─── Execute the pass ───────────────────────────────────
    try {
      switch (currentPass) {
        case "SKELETON":
          await runSkeletonPass(marie, activeChap, targetPath, logger);
          break;
        case "FLESH":
          await runFleshPass(
            marie,
            activeChap,
            targetPath,
            workingDir,
            logger,
            previousSummaries,
          );
          break;
        case "NERVE":
          await runNervePass(marie, activeChap, targetPath, logger);
          break;
        case "SOUL":
          await runSoulPass(marie, activeChap, targetPath, logger);
          break;
        default:
          await logger.log(
            activeChap.id,
            currentPass,
            `Unknown pass "${currentPass}". Skipping.`,
          );
          break;
      }
    } catch (err: any) {
      await logger.log(
        activeChap.id,
        currentPass,
        `Pass execution error: ${err.message}`,
      );
    }

    // ─── Advance the pass ───────────────────────────────────
    // The script now drives advancement, not the agent.
    // (Except for SKELETON which still self-advances via the agent's tool call.)
    if (currentPass !== "SKELETON") {
      await logger.log(activeChap.id, currentPass, "Attempting to advance pass...");
      try {
        await callAgent(
          marie,
          `The ${currentPass} pass for Chapter ${activeChap.id} is complete. Call advance_novel_pass NOW with a summary of the work done. Then STOP.`,
        );
      } catch (err: any) {
        await logger.log(
          activeChap.id,
          currentPass,
          `Advance call error: ${err.message}`,
        );
      }
    }

    // Verify advancement
    try {
      const updated = JSON.parse(
        await fs.readFile(novelStructurePath, "utf-8"),
      );
      const updatedVol = updated.volumes.find(
        (v: any) => v.id === activeVol.id,
      );
      const updatedChap = updatedVol.chapters.find(
        (c: any) => c.id === activeChap.id,
      );

      if (updatedChap.currentPass !== currentPass) {
        await logger.log(
          activeChap.id,
          currentPass,
          `✅ Advanced: ${currentPass} → ${updatedChap.currentPass}`,
        );
        attemptMap.delete(attemptKey);
      } else {
        await logger.log(
          activeChap.id,
          currentPass,
          `⚠️ Pass did not advance. Will retry.`,
        );
      }
    } catch {
      // Will be caught by circuit breaker on next iteration
    }

    // Cooldown
    process.stdout.write("⏸️ Cooling down for 8 seconds...\n");
    await new Promise((r) => setTimeout(r, 8000));
  }

  process.stdout.write("\n✨ Novel production finished.\n");
}

main().catch((err) => {
  process.stderr.write(`\n💥 Fatal: ${err.message || err}\n`);
  if (err.stack) process.stderr.write(`${err.stack}\n`);
  process.exit(1);
});
