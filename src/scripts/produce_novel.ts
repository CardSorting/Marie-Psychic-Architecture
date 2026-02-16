#!/usr/bin/env node
/**
 * Novel Production Pipeline v3 — Hardened Section-by-Section Assembly
 *
 * Architecture:
 *   - Script manages ALL file construction and pass advancement
 *   - Agent only writes short prose chunks (~500 words per turn)
 *   - Script parses, dispatches, validates, concatenates, and advances
 *   - Checkpoint/resume: skips already-written scene files
 *   - Content validation: ensures output is prose, not skeleton
 *   - Circuit breaker: force-advances after 3 failures
 */
import { MarieCLI } from "../monolith/adapters/CliMarieAdapter.js";
import { NovelProductionService } from "../monolith/infrastructure/ai/narrative/NovelProductionService.js";
import * as fs from "fs/promises";
import * as path from "path";

// ═══════════════════════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════════════════════

interface Scene {
  id: number;
  title: string;
  notes: string;
}

interface Section {
  id: number;
  header: string;
  content: string;
}

// ═══════════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════════

function countWords(text: string): number {
  return text.split(/\s+/).filter((w) => w.length > 0).length;
}

async function readSafe(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, "utf-8");
  } catch {
    return "";
  }
}

/** Check if text looks like actual prose (not outline/bullet points) */
function isProse(text: string): boolean {
  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length < 3) return false;
  // Count lines that are actual prose paragraphs (long, no bullets)
  const proseLines = lines.filter(
    (l) =>
      l.trim().length > 60 &&
      !l.trim().startsWith("-") &&
      !l.trim().startsWith("*") &&
      !l.trim().startsWith("#") &&
      !l.trim().startsWith("**"),
  );
  return proseLines.length >= 2;
}

/** Parse a skeleton file into individual scenes */
function parseScenes(content: string): Scene[] {
  const scenes: Scene[] = [];
  const lines = content.split("\n");
  let current: Scene | null = null;

  for (const line of lines) {
    const match = line.match(/\*\*Scene\s+(\d+)\s*[:—–-]\s*(.+?)\*\*/i);
    if (match) {
      if (current) scenes.push(current);
      current = {
        id: parseInt(match[1]),
        title: match[2].trim(),
        notes: line + "\n",
      };
    } else if (current) {
      // Stop at thematic sections or next act header
      if (
        line.startsWith("**Chapter Thematic") ||
        line.startsWith("**Foreshadowing") ||
        line.startsWith("**Character Arcs") ||
        (line.startsWith("---") && current.notes.length > 100)
      ) {
        scenes.push(current);
        current = null;
      } else {
        current.notes += line + "\n";
      }
    }
  }
  if (current) scenes.push(current);
  return scenes;
}

/** Split a chapter into sections by ## headers */
function splitSections(content: string): Section[] {
  const parts = content.split(/(?=^## )/m);
  return parts
    .filter((p) => p.trim().length > 30)
    .map((p, i) => {
      const firstLine = p.split("\n").find((l) => l.trim()) || "";
      return {
        id: i + 1,
        header: firstLine.trim().substring(0, 80),
        content: p,
      };
    });
}

/** Extract thematic/foreshadowing notes from skeleton */
function extractThematicNotes(content: string): string {
  const lines = content.split("\n");
  const thematic: string[] = [];
  let capture = false;
  for (const line of lines) {
    if (
      line.startsWith("**Chapter Thematic") ||
      line.startsWith("**Foreshadowing") ||
      line.startsWith("**Character Arcs")
    ) {
      capture = true;
    }
    if (capture) thematic.push(line);
  }
  return thematic.join("\n").trim();
}

// ═══════════════════════════════════════════════════════════════
//  PRODUCTION LOGGER
// ═══════════════════════════════════════════════════════════════

class Logger {
  private logPath: string;

  constructor(workingDir: string) {
    this.logPath = path.join(workingDir, ".vault", "novel", "production.log");
  }

  async log(ch: number, pass: string, msg: string, words?: number) {
    const ts = new Date().toISOString().substring(11, 19);
    const wc = words !== undefined ? ` [${words}w]` : "";
    const line = `[${ts}] Ch${ch}/${pass}: ${msg}${wc}\n`;
    process.stdout.write(`📝 ${line}`);
    try {
      await fs.mkdir(path.dirname(this.logPath), { recursive: true });
      await fs.appendFile(this.logPath, line);
    } catch {
      /* non-fatal */
    }
  }
}

// ═══════════════════════════════════════════════════════════════
//  AGENT INTERACTION
// ═══════════════════════════════════════════════════════════════

async function callAgent(marie: MarieCLI, prompt: string): Promise<void> {
  await marie.handleMessage(prompt, {
    onStream: (chunk) => process.stdout.write(chunk),
    onTool: (tool) => process.stdout.write(`\n🛠️ Tool: ${tool.name}\n`),
    onEvent: (event) => {
      if (event.type === "reasoning")
        process.stdout.write(`\n💭 ${event.text}\n`);
      if (event.type === "run_error")
        process.stderr.write(`\n❌ ${event.message}\n`);
    },
  });
}

/**
 * Call agent and verify it produced content at the target path.
 * Retries up to `maxRetries` times with progressively simpler prompts.
 * Returns the word count of the output file.
 */
async function agentWrite(
  marie: MarieCLI,
  prompt: string,
  outputPath: string,
  log: Logger,
  ch: number,
  pass: string,
  label: string,
  maxRetries = 2,
): Promise<{ words: number; grew: boolean }> {
  const before = countWords(await readSafe(outputPath));

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const finalPrompt =
      attempt === 1
        ? prompt
        : `${prompt}\n\nCRITICAL: Previous attempt produced NO output. You MUST write content to the file NOW. Just write prose — do not overthink. This is attempt ${attempt}/${maxRetries}.`;

    try {
      await callAgent(marie, finalPrompt);
    } catch (err: any) {
      await log.log(ch, pass, `${label}: agent error (${err.message})`);
    }

    const after = countWords(await readSafe(outputPath));
    const growth = after - before;

    if (growth > 30) {
      await log.log(ch, pass, `${label}: +${growth}w`, after);
      return { words: after, grew: true };
    }

    if (attempt < maxRetries) {
      await log.log(
        ch,
        pass,
        `${label}: stall (${growth}w). Retry ${attempt + 1}/${maxRetries}...`,
      );
      await sleep(3000);
    }
  }

  const finalWords = countWords(await readSafe(outputPath));
  await log.log(ch, pass, `${label}: failed after ${maxRetries} tries`, finalWords);
  return { words: finalWords, grew: false };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ═══════════════════════════════════════════════════════════════
//  PASS: SKELETON
// ═══════════════════════════════════════════════════════════════

async function passSkeleton(
  marie: MarieCLI,
  ch: any,
  targetPath: string,
  log: Logger,
): Promise<boolean> {
  await log.log(ch.id, "SKELETON", "Starting");

  const prompt = `Write a SKELETON outline for Chapter ${ch.id}: "${ch.title}".
Description: ${ch.description}
TARGET FILE: ${targetPath}

You MUST use this EXACT format:

## Act 1: [Title]

**Scene 1: [Title]**
- **Setting**: [vivid description of the location]
- **Characters**: [who appears, physical/emotional state]
- **Action**: [what happens]
- **Dialogue Beat**: [1-2 key lines of dialogue]
- **Sensory Detail**: [sights, sounds, smells, textures]
- **Foreshadowing**: [seeds for later]

**Scene 2: [Title]**
...

## Act 2: [Title]
...

End with:
**Chapter Thematic Core**: [theme]
**Foreshadowing Arc**: [seeds]
**Character Arcs Set**: [character developments]

Write 5-7 scenes total. Write to TARGET FILE using 'write_to_file'. Then STOP.
Do NOT call advance_novel_pass.`;

  await agentWrite(marie, prompt, targetPath, log, ch.id, "SKELETON", "Outline");

  // Validate: must contain **Scene headers
  const content = await readSafe(targetPath);
  const scenes = parseScenes(content);

  if (scenes.length === 0) {
    await log.log(ch.id, "SKELETON", "WARNING: No **Scene N:** headers found. Re-prompting...");

    const fixPrompt = `The skeleton outline you wrote does NOT contain **Scene N: Title** headers.
This format is CRITICAL for the pipeline. Rewrite the outline using EXACTLY this format:

**Scene 1: [Title]**
- **Setting**: ...
- **Characters**: ...

**Scene 2: [Title]**
...

Read the existing file at ${targetPath}, then REWRITE it with proper **Scene N:** formatting.
Write to the file using 'write_to_file'. Then STOP.`;

    await agentWrite(marie, fixPrompt, targetPath, log, ch.id, "SKELETON", "Format fix");
  }

  const finalScenes = parseScenes(await readSafe(targetPath));
  await log.log(
    ch.id,
    "SKELETON",
    `Complete: ${finalScenes.length} scenes, ${countWords(await readSafe(targetPath))}w`,
  );
  return finalScenes.length > 0;
}

// ═══════════════════════════════════════════════════════════════
//  PASS: FLESH (Scene-by-Scene Assembly)
// ═══════════════════════════════════════════════════════════════

async function passFlesh(
  marie: MarieCLI,
  ch: any,
  targetPath: string,
  workingDir: string,
  log: Logger,
  prevSummaries: string,
): Promise<boolean> {
  await log.log(ch.id, "FLESH", "Starting scene-by-scene assembly");

  // 1. Parse skeleton
  const skeleton = await readSafe(targetPath);
  const scenes = parseScenes(skeleton);
  const thematic = extractThematicNotes(skeleton);

  if (scenes.length === 0) {
    await log.log(ch.id, "FLESH", "ERROR: No scenes in skeleton. Cannot proceed.");
    return false;
  }

  await log.log(ch.id, "FLESH", `${scenes.length} scenes to write`);

  // 2. Prepare temp directory
  const tempDir = path.join(workingDir, ".vault", "novel", "temp");
  await fs.mkdir(tempDir, { recursive: true });

  // 3. Process each scene (with checkpoint/resume)
  let completedScenes = 0;

  for (const scene of scenes) {
    const sceneFile = path.join(tempDir, `ch${ch.id}_s${scene.id}.md`);

    // Checkpoint: skip if scene file already exists and has prose
    const existing = await readSafe(sceneFile);
    if (existing.trim().length > 100 && isProse(existing)) {
      await log.log(
        ch.id,
        "FLESH",
        `Scene ${scene.id} already written (checkpoint). Skipping.`,
        countWords(existing),
      );
      completedScenes++;
      continue;
    }

    const prompt = `Write PROSE for Scene ${scene.id} of Chapter ${ch.id}: "${ch.title}".
TARGET FILE: ${sceneFile}

${prevSummaries ? `STORY SO FAR:\n${prevSummaries}\n` : ""}
${thematic ? `THEMATIC CONTEXT:\n${thematic}\n` : ""}
SCENE NOTES TO EXPAND INTO PROSE:
${scene.notes.trim()}

WRITE 400-600 WORDS of immersive fiction for THIS SCENE ONLY:
- Vivid sensory detail (what things look, sound, smell, feel like)
- Actual dialogue with action beats ("she said, gripping the railing")
- Character interiority (thoughts, feelings, physical sensations)
- Atmospheric detail (lighting, ambient sounds, temperature)
- Varied sentence lengths — short for tension, flowing for wonder

FORMAT: Just prose paragraphs. NO headers, NO bullet points, NO metadata.
Write ONLY Scene ${scene.id}: "${scene.title}".

Write to TARGET FILE using 'write_to_file'. Then STOP.`;

    const result = await agentWrite(
      marie,
      prompt,
      sceneFile,
      log,
      ch.id,
      "FLESH",
      `Scene ${scene.id}: ${scene.title}`,
    );

    // Validate: is the output actually prose?
    const sceneContent = await readSafe(sceneFile);
    if (result.grew && !isProse(sceneContent)) {
      await log.log(
        ch.id,
        "FLESH",
        `Scene ${scene.id}: output is not prose. Retrying with emphasis...`,
      );

      const retryPrompt = `Your previous output was NOT prose fiction. It looks like bullet points or an outline.
Write ACTUAL NARRATIVE PROSE. Here is an example of what I need:

"The cathedral's vaulted ceiling loomed above, its stained glass casting fractured light across the cold marble floor. Something hummed in the air—not sound exactly, but the resonance of dormant processes awakening."

NOW write 400-600 words of prose like that for: ${scene.title}
Scene notes: ${scene.notes.trim().substring(0, 300)}

Write to ${sceneFile} using 'write_to_file'. Then STOP.`;

      await agentWrite(
        marie,
        retryPrompt,
        sceneFile,
        log,
        ch.id,
        "FLESH",
        `Scene ${scene.id}: prose retry`,
      );
    }

    completedScenes++;
    await sleep(3000);
  }

  // 4. Concatenate all scene files into the chapter
  await log.log(ch.id, "FLESH", `Concatenating ${completedScenes}/${scenes.length} scenes...`);

  const parts: string[] = [`# Chapter ${ch.id}: ${ch.title}\n\n`];
  let missingScenes = 0;

  for (const scene of scenes) {
    const sceneFile = path.join(tempDir, `ch${ch.id}_s${scene.id}.md`);
    const sceneContent = (await readSafe(sceneFile)).trim();

    if (sceneContent.length > 50) {
      parts.push(`## Scene ${scene.id}: ${scene.title}\n\n`);
      parts.push(sceneContent + "\n\n---\n\n");
    } else {
      missingScenes++;
      parts.push(`## Scene ${scene.id}: ${scene.title}\n\n`);
      parts.push(`*[Scene pending — content generation failed]*\n\n---\n\n`);
    }
  }

  const assembled = parts.join("");
  await fs.writeFile(targetPath, assembled);

  const totalWords = countWords(assembled);
  await log.log(
    ch.id,
    "FLESH",
    `Assembly complete. ${missingScenes > 0 ? `${missingScenes} gaps.` : "All scenes present."}`,
    totalWords,
  );

  // 5. Cleanup temp files
  for (const scene of scenes) {
    try {
      await fs.unlink(path.join(tempDir, `ch${ch.id}_s${scene.id}.md`));
    } catch {
      /* non-fatal */
    }
  }

  return true;
}

// ═══════════════════════════════════════════════════════════════
//  PASS: NERVE (Section-by-Section Expansion)
// ═══════════════════════════════════════════════════════════════

async function passNerve(
  marie: MarieCLI,
  ch: any,
  targetPath: string,
  workingDir: string,
  log: Logger,
): Promise<boolean> {
  const content = await readSafe(targetPath);
  const startWords = countWords(content);
  await log.log(ch.id, "NERVE", `Starting. Current: ${startWords}w. Target: +30%`);

  // Split into sections
  const sections = splitSections(content);
  if (sections.length === 0) {
    await log.log(ch.id, "NERVE", "No sections found. Skipping.");
    return true;
  }

  const tempDir = path.join(workingDir, ".vault", "novel", "temp");
  await fs.mkdir(tempDir, { recursive: true });

  // Expand each section independently
  for (const section of sections) {
    const sectionWords = countWords(section.content);
    if (sectionWords < 30) continue; // Skip tiny sections

    const sectionFile = path.join(tempDir, `ch${ch.id}_nerve_s${section.id}.md`);

    // Give agent ONLY this section to expand
    await fs.writeFile(sectionFile, section.content);

    const prompt = `NERVE PASS: Expand this section of Chapter ${ch.id}: "${ch.title}".

The section is in file: ${sectionFile}
Read it, then EXPAND it by adding 200-400 NEW words woven into the existing text:

- Add a new sensory layer (smell, texture, temperature, ambient sound)
- Deepen any dialogue with subtext (characters meaning more than they say)
- Insert an internal conflict moment (doubt, fear, desire)
- Add environmental storytelling (the world reacts to mood: light shifts, sounds change)
- Weave in a foreshadowing detail

RULES:
- Do NOT delete or shorten existing text
- Keep the ## header intact
- Write the EXPANDED section back to the SAME FILE: ${sectionFile}
- Write using 'write_to_file'. Then STOP.`;

    await agentWrite(
      marie,
      prompt,
      sectionFile,
      log,
      ch.id,
      "NERVE",
      `Expand: ${section.header.substring(0, 40)}`,
    );

    await sleep(3000);
  }

  // Reassemble from expanded sections
  await log.log(ch.id, "NERVE", "Reassembling expanded sections...");
  const expanded: string[] = [];

  for (const section of sections) {
    const sectionFile = path.join(tempDir, `ch${ch.id}_nerve_s${section.id}.md`);
    const expandedContent = await readSafe(sectionFile);
    expanded.push(
      expandedContent.trim().length > section.content.trim().length
        ? expandedContent
        : section.content,
    );

    try {
      await fs.unlink(sectionFile);
    } catch {
      /* non-fatal */
    }
  }

  const reassembled = expanded.join("\n\n");
  await fs.writeFile(targetPath, reassembled);

  const endWords = countWords(reassembled);
  const growth = endWords - startWords;
  await log.log(ch.id, "NERVE", `Complete: ${startWords}w → ${endWords}w (+${growth}w)`, endWords);

  return true;
}

// ═══════════════════════════════════════════════════════════════
//  PASS: SOUL (Section-by-Section Polish)
// ═══════════════════════════════════════════════════════════════

async function passSoul(
  marie: MarieCLI,
  ch: any,
  targetPath: string,
  workingDir: string,
  log: Logger,
): Promise<boolean> {
  const content = await readSafe(targetPath);
  const startWords = countWords(content);
  await log.log(ch.id, "SOUL", `Starting polish. Current: ${startWords}w`);

  const sections = splitSections(content);
  if (sections.length === 0) {
    await log.log(ch.id, "SOUL", "No sections found. Skipping.");
    return true;
  }

  const tempDir = path.join(workingDir, ".vault", "novel", "temp");
  await fs.mkdir(tempDir, { recursive: true });

  // Polish each section independently, with context from neighbors
  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    const sectionWords = countWords(section.content);
    if (sectionWords < 30) continue;

    const sectionFile = path.join(tempDir, `ch${ch.id}_soul_s${section.id}.md`);
    await fs.writeFile(sectionFile, section.content);

    // Provide neighboring sections for context (but don't ask to rewrite them)
    const prevContext =
      i > 0
        ? `PREVIOUS SECTION (for context only, do NOT rewrite):\n${sections[i - 1].content.substring(0, 300)}...\n\n`
        : "";
    const nextContext =
      i < sections.length - 1
        ? `NEXT SECTION (for context only, do NOT rewrite):\n${sections[i + 1].content.substring(0, 300)}...\n\n`
        : "";

    const isFirst = i === 0;
    const isLast = i === sections.length - 1;

    const prompt = `SOUL PASS: Polish this section of Chapter ${ch.id}: "${ch.title}".

The section is in file: ${sectionFile}
Read it, then POLISH it:
${isFirst ? "- This is the OPENING — craft a powerful hook that grabs the reader in the first sentence\n" : ""}${isLast ? "- This is the CLOSING — craft a compelling final line (cliffhanger, revelation, or lingering emotion)\n" : ""}- Replace any clichéd metaphors with original, vivid imagery
- Ensure consistent narrative voice and tense
- Vary paragraph and sentence length for rhythm
- Smooth the transition ${isFirst ? "into" : "from the previous section and into"} ${isLast ? "the chapter's end" : "the next section"}
- Fix any awkward phrasing or redundancies
- Do NOT shorten the section — maintain or increase word count

${prevContext}${nextContext}
Write the polished section back to: ${sectionFile}
Use 'write_to_file'. Then STOP.`;

    await agentWrite(
      marie,
      prompt,
      sectionFile,
      log,
      ch.id,
      "SOUL",
      `Polish: ${section.header.substring(0, 40)}`,
    );

    await sleep(3000);
  }

  // Reassemble
  await log.log(ch.id, "SOUL", "Reassembling polished sections...");
  const polished: string[] = [];

  for (const section of sections) {
    const sectionFile = path.join(tempDir, `ch${ch.id}_soul_s${section.id}.md`);
    const polishedContent = await readSafe(sectionFile);
    polished.push(
      polishedContent.trim().length >= section.content.trim().length * 0.9
        ? polishedContent
        : section.content,
    );

    try {
      await fs.unlink(sectionFile);
    } catch {
      /* non-fatal */
    }
  }

  const reassembled = polished.join("\n\n");
  await fs.writeFile(targetPath, reassembled);

  const endWords = countWords(reassembled);
  await log.log(ch.id, "SOUL", `Complete: ${startWords}w → ${endWords}w`, endWords);

  return true;
}

// ═══════════════════════════════════════════════════════════════
//  DIRECT PASS ADVANCEMENT
// ═══════════════════════════════════════════════════════════════

/**
 * Advance the pass DIRECTLY via NovelProductionService.
 * This is the most critical reliability improvement —
 * we no longer rely on the agent to call advance_novel_pass.
 */
async function advancePassDirect(
  workingDir: string,
  log: Logger,
  ch: any,
  pass: string,
  summary: string,
): Promise<boolean> {
  try {
    const service = new NovelProductionService(workingDir);
    await service.initialize();
    const result = await service.advancePass(summary);

    if (result.success) {
      await log.log(ch.id, pass, `✅ ADVANCED: ${result.message}`);
      return true;
    } else {
      await log.log(ch.id, pass, `⚠️ Advancement rejected: ${result.message}`);
      return false;
    }
  } catch (err: any) {
    await log.log(ch.id, pass, `❌ Advancement error: ${err.message}`);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════
//  MAIN
// ═══════════════════════════════════════════════════════════════

async function main() {
  const workingDir = process.cwd();
  const structurePath = path.join(workingDir, ".marie", "novel_structure.json");
  const log = new Logger(workingDir);

  process.stdout.write("🔮 Novel Production Pipeline v3 — Starting...\n");

  // ─── Initialize MarieCLI ────────────────────────────────────
  let marie: MarieCLI;
  try {
    marie = new MarieCLI(workingDir);
    process.stdout.write("✅ MarieCLI initialized.\n");
  } catch (err: any) {
    process.stderr.write(`❌ MarieCLI failed: ${err.message}\n`);
    process.exit(1);
  }

  // ─── Initialize novel structure ─────────────────────────────
  try {
    await fs.access(structurePath);
    process.stdout.write("✅ Novel structure found.\n");
  } catch {
    process.stdout.write("🚀 Initializing from lightnovel.md...\n");
    try {
      const outline = await fs.readFile(
        path.join(workingDir, "lightnovel.md"),
        "utf-8",
      );
      const chapters: { title: string; description: string }[] = [];
      let cur: { title: string; description: string } | null = null;

      for (const line of outline.split("\n")) {
        const m = line.match(/^Chapter \d+ — (.+)/);
        if (m) {
          if (cur) chapters.push(cur);
          cur = { title: m[1], description: "" };
        } else if (cur && line.trim() && !line.startsWith("Arc")) {
          cur.description += line.trim() + " ";
        }
      }
      if (cur) chapters.push(cur);

      const svc = new NovelProductionService(workingDir);
      (svc as any).structure = {
        volumes: [
          { id: 1, title: "Volume I: The Rollback", status: "DRAFT", chapters: [] },
        ],
      };
      await svc.save();
      for (const c of chapters) {
        await svc.startNewChapter(c.title, c.description.trim());
      }
      process.stdout.write(`✅ ${chapters.length} chapters initialized.\n`);
    } catch (err: any) {
      process.stderr.write(`❌ Init failed: ${err.message}\n`);
      process.exit(1);
    }
  }

  // ─── Production Loop ────────────────────────────────────────
  const attempts = new Map<string, number>();

  while (true) {
    // Read fresh state each loop
    let structure;
    try {
      structure = JSON.parse(await fs.readFile(structurePath, "utf-8"));
    } catch (err: any) {
      process.stderr.write(`❌ Read structure: ${err.message}\n`);
      process.exit(1);
    }

    const vol = structure.volumes.find((v: any) => v.status === "DRAFT");
    if (!vol) {
      process.stdout.write("🏁 No draft volumes. Done.\n");
      break;
    }

    const ch = vol.chapters.find((c: any) => c.currentPass !== "CANON");
    if (!ch) {
      process.stdout.write("🏁 All chapters Canon. Done!\n");
      break;
    }

    const pass = ch.currentPass as string;
    const key = `${ch.id}:${pass}`;
    const attempt = (attempts.get(key) || 0) + 1;
    attempts.set(key, attempt);

    // ─── Circuit breaker ────────────────────────────────────
    if (attempt > 3) {
      await log.log(ch.id, pass, `CIRCUIT BREAKER: ${attempt} attempts. Force-advancing.`);
      const forced = await advancePassDirect(
        workingDir,
        log,
        ch,
        pass,
        `FORCED after ${attempt} failed attempts.`,
      );
      if (!forced) {
        process.stderr.write(`❌ Force-advance failed. Exiting.\n`);
        break;
      }
      attempts.delete(key);
      continue;
    }

    // ─── Build paths ────────────────────────────────────────
    const sanitized = ch.title.replace(/[^a-zA-Z0-9]/g, "_");
    const filename = `Chapter_${ch.id}_${sanitized}.md`;
    const targetPath = path.join(workingDir, ".vault", "novel", "chapters", filename);
    await fs.mkdir(path.dirname(targetPath), { recursive: true });

    // Previous chapter summaries
    const prevSummaries = vol.chapters
      .filter((c: any) => c.id < ch.id && c.continuityLedger.length > 0)
      .map(
        (c: any) =>
          `Ch${c.id} "${c.title}": ${c.continuityLedger[c.continuityLedger.length - 1]?.summary || "No summary."}`,
      )
      .join("\n");

    // ─── Header ─────────────────────────────────────────────
    process.stdout.write(`\n${"═".repeat(67)}\n`);
    process.stdout.write(`📖 Ch${ch.id}: "${ch.title}" | ${pass} | Attempt ${attempt}/3\n`);
    process.stdout.write(`${"═".repeat(67)}\n\n`);

    // ─── Execute pass ───────────────────────────────────────
    let passOk = false;
    try {
      switch (pass) {
        case "SKELETON":
          passOk = await passSkeleton(marie, ch, targetPath, log);
          break;
        case "FLESH":
          passOk = await passFlesh(marie, ch, targetPath, workingDir, log, prevSummaries);
          break;
        case "NERVE":
          passOk = await passNerve(marie, ch, targetPath, workingDir, log);
          break;
        case "SOUL":
          passOk = await passSoul(marie, ch, targetPath, workingDir, log);
          break;
        default:
          await log.log(ch.id, pass, `Unknown pass. Skipping.`);
          passOk = true;
      }
    } catch (err: any) {
      await log.log(ch.id, pass, `Pass error: ${err.message}`);
    }

    // ─── Advance (script-direct, no agent dependency) ───────
    if (passOk) {
      const finalWords = countWords(await readSafe(targetPath));
      const advanced = await advancePassDirect(
        workingDir,
        log,
        ch,
        pass,
        `${pass} pass complete. ${finalWords} words. ${parseScenes(await readSafe(targetPath)).length || "?"} scenes.`,
      );

      if (advanced) {
        attempts.delete(key);
      }
    }

    // ─── Cooldown ───────────────────────────────────────────
    process.stdout.write("⏸️ Cooling down 8s...\n");
    await sleep(8000);
  }

  process.stdout.write("\n✨ Novel production finished.\n");
}

main().catch((err) => {
  process.stderr.write(`\n💥 Fatal: ${err.message || err}\n`);
  if (err.stack) process.stderr.write(`${err.stack}\n`);
  process.exit(1);
});
