#!/usr/bin/env node
/**
 * Novel Production Pipeline v4 — Stream Capture Architecture
 *
 * KEY DESIGN DECISION:
 *   The agent does NOT write files. The script captures the agent's
 *   streamed text output and writes it directly. This eliminates
 *   all file-writing failures (wrong paths, tool failures, validation).
 *
 * Flow:
 *   1. Script sends prompt asking agent to write prose (no write_to_file)
 *   2. Agent streams text back
 *   3. Script captures all streamed text
 *   4. Script writes it to the correct file
 *   5. Script advances the pass directly via NovelProductionService
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

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Check if text looks like prose (not outline/bullets) */
function isProse(text: string): boolean {
  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length < 2) return false;
  const proseLines = lines.filter(
    (l) =>
      l.trim().length > 40 &&
      !l.trim().startsWith("- **") &&
      !l.trim().startsWith("* **"),
  );
  return proseLines.length >= 2;
}

/** Parse skeleton for Scene blocks */
function parseScenes(content: string): Scene[] {
  const scenes: Scene[] = [];
  const lines = content.split("\n");
  let current: Scene | null = null;

  for (const line of lines) {
    const m = line.match(/\*\*Scene\s+(\d+)\s*[:—–-]?\s*(.+?)\*\*/i);
    if (m) {
      if (current) scenes.push(current);
      current = {
        id: parseInt(m[1]),
        title: m[2].trim(),
        notes: line + "\n",
      };
    } else if (current) {
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

/** Extract thematic notes from skeleton */
function extractThematicNotes(content: string): string {
  const lines = content.split("\n");
  const out: string[] = [];
  let capture = false;
  for (const line of lines) {
    if (
      line.startsWith("**Chapter Thematic") ||
      line.startsWith("**Foreshadowing") ||
      line.startsWith("**Character Arcs")
    ) {
      capture = true;
    }
    if (capture) out.push(line);
  }
  return out.join("\n").trim();
}

/** Clean up captured stream — remove tool call artifacts, code fences, etc. */
function cleanStreamOutput(raw: string): string {
  let text = raw;
  // Remove code fence wrappers if the agent wrapped prose in markdown
  text = text.replace(/^```(?:markdown|md)?\s*\n/gm, "");
  text = text.replace(/\n```\s*$/gm, "");
  // Remove any "Now I STOP" or similar agent meta-commentary
  text = text.replace(/\n*(?:Now I (?:STOP|stop)|I'll stop here|That's all)\.?\s*$/g, "");
  return text.trim();
}

// ═══════════════════════════════════════════════════════════════
//  PRODUCTION LOGGER
// ═══════════════════════════════════════════════════════════════

class Log {
  private logPath: string;

  constructor(workingDir: string) {
    this.logPath = path.join(workingDir, ".vault", "novel", "production.log");
  }

  async write(ch: number, pass: string, msg: string, words?: number) {
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
//  STREAM CAPTURE AGENT
// ═══════════════════════════════════════════════════════════════

/**
 * Call the agent and capture ALL streamed text.
 * The agent is told NOT to use write_to_file — just output prose.
 * Returns the captured text.
 */
async function captureAgentOutput(
  marie: MarieCLI,
  prompt: string,
): Promise<string> {
  const chunks: string[] = [];
  await marie.handleMessage(prompt, {
    onStream: (chunk) => {
      chunks.push(chunk);
      process.stdout.write(chunk);
    },
    onTool: (tool) => {
      process.stdout.write(`\n🛠️ Tool: ${tool.name}\n`);
    },
    onEvent: (event) => {
      if (event.type === "reasoning") {
        process.stdout.write(`\n💭 ${event.text}\n`);
      }
      if (event.type === "run_error") {
        process.stderr.write(`\n❌ ${event.message}\n`);
      }
    },
  });
  return cleanStreamOutput(chunks.join(""));
}

/**
 * Capture agent output with retry on stall.
 * Returns the captured prose text.
 */
async function captureWithRetry(
  marie: MarieCLI,
  prompt: string,
  log: Log,
  ch: number,
  pass: string,
  label: string,
  minWords: number = 50,
  maxRetries: number = 2,
): Promise<string> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const finalPrompt =
      attempt === 1
        ? prompt
        : `${prompt}\n\nCRITICAL: Your previous response was too short. You MUST write at least ${minWords} words. Just write — do not explain or ask questions. Attempt ${attempt}/${maxRetries}.`;

    let captured = "";
    try {
      captured = await captureAgentOutput(marie, finalPrompt);
    } catch (err: any) {
      await log.write(ch, pass, `${label}: agent error (${err.message})`);
    }

    const words = countWords(captured);
    if (words >= minWords) {
      await log.write(ch, pass, `${label}: captured ${words}w`);
      return captured;
    }

    if (attempt < maxRetries) {
      await log.write(
        ch,
        pass,
        `${label}: too short (${words}w). Retry ${attempt + 1}/${maxRetries}...`,
      );
      await sleep(3000);
    }
  }

  await log.write(ch, pass, `${label}: failed after ${maxRetries} retries`);
  return "";
}

/**
 * Pass: SKELETON (Granular Depth Mode)
 *
 * 1. Generate high-level list of scenes
 * 2. For each scene, generate deep architectural notes
 * 3. Generate thematic/foreshadowing metadata
 * 4. Assemble and write
 */
async function passSkeleton(
  marie: MarieCLI,
  ch: any,
  targetPath: string,
  log: Log,
): Promise<boolean> {
  await log.write(ch.id, "SKELETON", "Starting granular architecture mode");

  // PHASE 1: Structure
  const structurePrompt = `Create a high-level scene list for Chapter ${ch.id}: "${ch.title}".
Description: ${ch.description}

Write 5-8 scene titles with a one-sentence summary for each.
Format:
**Scene 1: [Title]** — [Summary]
**Scene 2: [Title]** — [Summary]
...

Do NOT write full notes yet. Output ONLY the list. Then STOP.`;

  const structureRaw = await captureWithRetry(
    marie,
    structurePrompt,
    log,
    ch.id,
    "SKELETON",
    "Scene List",
    50,
  );

  if (!structureRaw) return false;

  const sceneTitles: { id: number; title: string; summary: string }[] = [];
  const lines = structureRaw.split("\n");
  for (const line of lines) {
    // Permissive regex for scene headers
    const m = line.match(/\*\*Scene\s+(\d+)\s*[:—–-]?\s*(.+?)\*\*\s*[:—–-]?\s*(.+)/i);
    if (m) {
      sceneTitles.push({
        id: parseInt(m[1]),
        title: m[2].trim(),
        summary: m[3].trim(),
      });
    }
  }

  if (sceneTitles.length === 0) {
    await log.write(ch.id, "SKELETON", "Failed to parse scene list. Aborting.");
    return false;
  }

  await log.write(ch.id, "SKELETON", `Architecting ${sceneTitles.length} scenes...`);

  // PHASE 2: Depth
  const sceneNotes: Map<number, string> = new Map();
  for (const s of sceneTitles) {
    const depthPrompt = `You are a story architect. Provide deep, vivid notes for Scene ${s.id} of Chapter ${ch.id}.

CHAPTER: "${ch.title}"
SCENE: "${s.title}"
SUMMARY: ${s.summary}

WRITE DEEP NOTES FOR:
- **Setting**: [Atmospheric, sensory description]
- **Characters**: [Emotional state, goals]
- **Action**: [Beat-by-beat what happens]
- **Dialogue Beat**: [Key lines or subtext]
- **Sensory Detail**: [Sights, sounds, smells, textures]
- **Thematic Hook**: [Connection to core theme]

Format:
**Scene ${s.id}: ${s.title}**
- **Setting**: ...
- **Characters**: ...
...

Do NOT write prose. Just detailed notes. Then STOP.`;

    const notes = await captureWithRetry(
      marie,
      depthPrompt,
      log,
      ch.id,
      "SKELETON",
      `Notes: ${s.title}`,
      100,
    );

    if (notes) sceneNotes.set(s.id, notes);
    await sleep(3000);
  }

  // PHASE 3: Thematic Metadata
  const metaPrompt = `Finalize the chapter architecture for Chapter ${ch.id}: "${ch.title}".
Write the thematic core, foreshadowing, and character arc progression.

FORMAT:
**Chapter Thematic Core**: [Theme]
**Foreshadowing**: [Clues for later]
**Character Arcs**: [How they change]

Output directly. Then STOP.`;

  const metaRaw = await captureWithRetry(
    marie,
    metaPrompt,
    log,
    ch.id,
    "SKELETON",
    "Metadata",
    50,
  );

  // PHASE 4: Assembly
  const assembled: string[] = [`# Chapter ${ch.id}: ${ch.title} — SKELETON\n\n`];
  for (const s of sceneTitles) {
    const notes = sceneNotes.get(s.id);
    if (notes) {
      assembled.push(notes + "\n\n---\n\n");
    } else {
      assembled.push(`**Scene ${s.id}: ${s.title}**\n*(Notes missing)*\n\n---\n\n`);
    }
  }
  if (metaRaw) {
    assembled.push(metaRaw);
  }

  const finalContent = assembled.join("");
  await fs.writeFile(targetPath, finalContent);

  const finalWords = countWords(finalContent);
  await log.write(
    ch.id,
    "SKELETON",
    `Complete: ${sceneNotes.size}/${sceneTitles.length} detailed scenes`,
    finalWords,
  );

  return sceneNotes.size > 0;
}

// ═══════════════════════════════════════════════════════════════
//  PASS: FLESH (Stream Capture — scene by scene)
// ═══════════════════════════════════════════════════════════════

async function passFlesh(
  marie: MarieCLI,
  ch: any,
  targetPath: string,
  log: Log,
  prevSummaries: string,
): Promise<boolean> {
  await log.write(ch.id, "FLESH", "Starting — stream capture mode");

  const skeleton = await readSafe(targetPath);
  let scenes = parseScenes(skeleton);
  const thematic = extractThematicNotes(skeleton);

  if (scenes.length === 0) {
    await log.write(ch.id, "FLESH", "No scenes in skeleton. Using whole file as 1 scene.");
    scenes = [{ id: 1, title: ch.title, notes: skeleton }];
  }

  await log.write(ch.id, "FLESH", `${scenes.length} scenes to write`);

  const sceneProse: Map<number, string> = new Map();

  for (const scene of scenes) {
    const prompt = `You are a novelist. Write prose fiction for this scene.

CHAPTER: "${ch.title}"
${prevSummaries ? `\nSTORY SO FAR:\n${prevSummaries}` : ""}
${thematic ? `\nTHEMATIC CONTEXT:\n${thematic}` : ""}

SCENE TO WRITE — Scene ${scene.id}: "${scene.title}"
${scene.notes.trim()}

INSTRUCTIONS:
Write 400-600 words of immersive fiction. Include:
- Vivid sensory detail (sights, sounds, smells, textures, temperature)
- Natural dialogue with action beats
- Character interiority (thoughts, feelings, physical sensations)
- Atmospheric world-building woven into action

Write ONLY prose paragraphs. No headers. No bullets. No metadata.
Do NOT use any tools — just write the prose directly. Then STOP.`;

    const captured = await captureWithRetry(
      marie,
      prompt,
      log,
      ch.id,
      "FLESH",
      `Scene ${scene.id}: ${scene.title}`,
      100,
    );

    if (captured && countWords(captured) > 50) {
      sceneProse.set(scene.id, captured);
    }

    await sleep(4000);
  }

  // Concatenate
  await log.write(ch.id, "FLESH", `Concatenating ${sceneProse.size}/${scenes.length} scenes...`);

  const parts: string[] = [`# Chapter ${ch.id}: ${ch.title}\n\n`];
  let gaps = 0;

  for (const scene of scenes) {
    parts.push(`## Scene ${scene.id}: ${scene.title}\n\n`);
    const prose = sceneProse.get(scene.id);
    if (prose) {
      parts.push(prose + "\n\n---\n\n");
    } else {
      gaps++;
      parts.push(`*[Scene pending]*\n\n---\n\n`);
    }
  }

  const assembled = parts.join("");
  await fs.writeFile(targetPath, assembled);

  const totalWords = countWords(assembled);
  await log.write(
    ch.id,
    "FLESH",
    `Assembly done. ${gaps > 0 ? `${gaps} gaps.` : "All present."}`,
    totalWords,
  );

  return true;
}

// ═══════════════════════════════════════════════════════════════
//  PASS: NERVE (Stream Capture — section by section)
// ═══════════════════════════════════════════════════════════════

async function passNerve(
  marie: MarieCLI,
  ch: any,
  targetPath: string,
  log: Log,
): Promise<boolean> {
  const content = await readSafe(targetPath);
  const startWords = countWords(content);
  await log.write(ch.id, "NERVE", `Starting. ${startWords}w. Target: +30%`);

  const sections = splitSections(content);
  if (sections.length === 0) {
    await log.write(ch.id, "NERVE", "No sections. Skipping.");
    return true;
  }

  const expanded: string[] = [];

  for (const section of sections) {
    const sectionWords = countWords(section.content);
    if (sectionWords < 30) {
      expanded.push(section.content);
      continue;
    }

    const prompt = `You are a literary editor. EXPAND the following prose section by weaving in 200-400 NEW words.

SECTION TO EXPAND:
---
${section.content}
---

ADD to the existing text:
- A new sensory layer
- Subtext in dialogue
- Internal conflict or doubt
- Environmental storytelling

RULES:
- Keep ALL existing text — only ADD to it
- Keep the ## header if present
- Output the EXPANDED section directly. Then STOP.`;

    const captured = await captureWithRetry(
      marie,
      prompt,
      log,
      ch.id,
      "NERVE",
      `Expand: ${section.header.substring(0, 40)}`,
      sectionWords, 
    );

    if (captured && countWords(captured) > sectionWords) {
      expanded.push(captured);
    } else {
      expanded.push(section.content); 
    }

    await sleep(4000);
  }

  const reassembled = expanded.join("\n\n");
  await fs.writeFile(targetPath, reassembled);

  const endWords = countWords(reassembled);
  await log.write(
    ch.id,
    "NERVE",
    `Done: ${startWords}w → ${endWords}w (+${endWords - startWords}w)`,
    endWords,
  );

  return true;
}

// ═══════════════════════════════════════════════════════════════
//  PASS: SOUL (Stream Capture — section by section)
// ═══════════════════════════════════════════════════════════════

async function passSoul(
  marie: MarieCLI,
  ch: any,
  targetPath: string,
  log: Log,
): Promise<boolean> {
  const content = await readSafe(targetPath);
  const startWords = countWords(content);
  await log.write(ch.id, "SOUL", `Starting polish. ${startWords}w`);

  const sections = splitSections(content);
  if (sections.length === 0) {
    await log.write(ch.id, "SOUL", "No sections. Skipping.");
    return true;
  }

  const polished: string[] = [];

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    const sectionWords = countWords(section.content);
    if (sectionWords < 30) {
      polished.push(section.content);
      continue;
    }

    const isFirst = i === 0;
    const isLast = i === sections.length - 1;

    const prompt = `You are a literary editor doing a FINAL POLISH. Refine this prose section.

SECTION TO POLISH:
---
${section.content}
---

${isFirst ? "This is the OPENING — craft a powerful hook.\n" : ""}${isLast ? "This is the CLOSING — craft a compelling final line.\n" : ""}
POLISH:
- Replace clichés
- Ensure consistent voice
- Vary sentence length
- Fix redundancies

Output the POLISHED section directly. Then STOP.`;

    const captured = await captureWithRetry(
      marie,
      prompt,
      log,
      ch.id,
      "SOUL",
      `Polish: ${section.header.substring(0, 40)}`,
      Math.floor(sectionWords * 0.8), 
    );

    if (captured && countWords(captured) >= sectionWords * 0.8) {
      polished.push(captured);
    } else {
      polished.push(section.content);
    }

    await sleep(4000);
  }

  const reassembled = polished.join("\n\n");
  await fs.writeFile(targetPath, reassembled);

  const endWords = countWords(reassembled);
  await log.write(
    ch.id,
    "SOUL",
    `Done: ${startWords}w → ${endWords}w`,
    endWords,
  );

  return true;
}

// ═══════════════════════════════════════════════════════════════
//  DIRECT PASS ADVANCEMENT
// ═══════════════════════════════════════════════════════════════

async function advanceDirect(
  workingDir: string,
  log: Log,
  ch: any,
  pass: string,
  summary: string,
  force: boolean = false,
): Promise<boolean> {
  try {
    const svc = new NovelProductionService(workingDir);
    await svc.initialize();
    const result = await svc.advancePass(summary, force);
    if (result.success) {
      await log.write(ch.id, pass, `✅ ADVANCED: ${result.message}`);
      return true;
    } else {
      await log.write(ch.id, pass, `⚠️ Rejected: ${result.message}`);
      return false;
    }
  } catch (err: any) {
    await log.write(ch.id, pass, `❌ Advance error: ${err.message}`);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════
//  MAIN
// ═══════════════════════════════════════════════════════════════

async function main() {
  const workingDir = process.cwd();
  const structurePath = path.join(workingDir, ".marie", "novel_structure.json");
  const log = new Log(workingDir);

  process.stdout.write("🔮 Novel Pipeline v4 — Stream Capture Architecture\n\n");

  // Init MarieCLI
  let marie: MarieCLI;
  try {
    marie = new MarieCLI(workingDir);
    process.stdout.write("✅ MarieCLI initialized.\n");
  } catch (err: any) {
    process.stderr.write(`❌ MarieCLI: ${err.message}\n`);
    process.exit(1);
  }

  // Init novel structure
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
          {
            id: 1,
            title: "Volume I: The Rollback",
            status: "DRAFT",
            chapters: [],
          },
        ],
      };
      await svc.save();
      for (const c of chapters) {
        await svc.startNewChapter(c.title, c.description.trim());
      }
      process.stdout.write(`✅ ${chapters.length} chapters initialized.\n`);
    } catch (err: any) {
      process.stderr.write(`❌ Init: ${err.message}\n`);
      process.exit(1);
    }
  }

  // ─── PRODUCTION LOOP ───────────────────────────────────────
  const attempts = new Map<string, number>();

  while (true) {
    let structure;
    try {
      structure = JSON.parse(await fs.readFile(structurePath, "utf-8"));
    } catch (err: any) {
      process.stderr.write(`❌ Read: ${err.message}\n`);
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

    // Circuit breaker
    if (attempt > 3) {
      await log.write(ch.id, pass, `CIRCUIT BREAKER: attempt ${attempt}. Force-advance.`);
      await advanceDirect(workingDir, log, ch, pass, `FORCED after ${attempt} attempts.`, true);
      attempts.delete(key);
      continue;
    }

    // Build paths
    const sanitized = ch.title.replace(/[^a-zA-Z0-9]/g, "_");
    const filename = `Chapter_${ch.id}_${sanitized}.md`;
    const targetPath = path.join(
      workingDir,
      ".vault",
      "novel",
      "chapters",
      filename,
    );
    await fs.mkdir(path.dirname(targetPath), { recursive: true });

    // Previous chapter summaries
    const prevSummaries = vol.chapters
      .filter(
        (c: any) => c.id < ch.id && c.continuityLedger.length > 0,
      )
      .map(
        (c: any) =>
          `Ch${c.id} "${c.title}": ${c.continuityLedger[c.continuityLedger.length - 1]?.summary || ""}`,
      )
      .join("\n");

    // Header
    process.stdout.write(`\n${"═".repeat(67)}\n`);
    process.stdout.write(
      `📖 Ch${ch.id}: "${ch.title}" | ${pass} | Attempt ${attempt}/3\n`,
    );
    process.stdout.write(`${"═".repeat(67)}\n\n`);

    // Execute pass
    let passOk = false;
    try {
      switch (pass) {
        case "SKELETON":
          passOk = await passSkeleton(marie, ch, targetPath, log);
          break;
        case "FLESH":
          passOk = await passFlesh(marie, ch, targetPath, log, prevSummaries);
          break;
        case "NERVE":
          passOk = await passNerve(marie, ch, targetPath, log);
          break;
        case "SOUL":
          passOk = await passSoul(marie, ch, targetPath, log);
          break;
        default:
          await log.write(ch.id, pass, `Unknown pass. Skipping.`);
          passOk = true;
      }
    } catch (err: any) {
      await log.write(ch.id, pass, `Error: ${err.message}`);
    }

    // Advance
    if (passOk) {
      const words = countWords(await readSafe(targetPath));
      const advanced = await advanceDirect(
        workingDir,
        log,
        ch,
        pass,
        `${pass} complete. ${words} words.`,
      );
      if (advanced) attempts.delete(key);
    }

    // Cooldown
    process.stdout.write("⏸️ Cooldown 8s...\n");
    await sleep(8000);
  }

  process.stdout.write("\n✨ Novel production finished.\n");
}

main().catch((err) => {
  process.stderr.write(`\n💥 Fatal: ${err.message || err}\n`);
  if (err.stack) process.stderr.write(`${err.stack}\n`);
  process.exit(1);
});
