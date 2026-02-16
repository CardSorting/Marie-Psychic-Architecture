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

async function getLore(workingDir: string): Promise<string> {
  try {
    const memoryPath = path.join(workingDir, ".marie", "ghostwriter_memory.json");
    const raw = await fs.readFile(memoryPath, "utf-8");
    const memory = JSON.parse(raw);
    const bible = (memory.characterBible || [])
      .map((c: any) => `- ${c.name}: ${c.archetype}. Voice: ${c.voice} Traits: ${c.traits?.join(", ")}`)
      .join("\n");
    const lexicon = Object.entries(memory.worldLexicon?.terms || {})
      .map(([k, v]) => `- ${k}: ${v}`)
      .join("\n");
    return `\nCHARACTER BIBLE:\n${bible}\n\nWORLD LEXICON:\n${lexicon}\n`;
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
 */
async function passSkeleton(
  marie: MarieCLI,
  ch: any,
  targetPath: string,
  log: Log,
  lore: string,
  feedback: string = "",
): Promise<boolean> {
  await log.write(ch.id, "SKELETON", "Starting granular architecture mode");

  // PHASE 1: Structure
  const structurePrompt = `Create a high-level scene list for Chapter ${ch.id}: "${ch.title}".
Description: ${ch.description}
${lore}
${feedback ? `\nFEEDBACK FROM EDITOR:\n${feedback}\n` : ""}

Write 5-8 scene titles with a one-sentence summary for each.
Format:
**Scene 1: [Title]** — [Summary]
...

Output ONLY the list. Then STOP.`;

  const structureRaw = await captureWithRetry(marie, structurePrompt, log, ch.id, "SKELETON", "Scene List", 50);
  if (!structureRaw) return false;

  const sceneTitles: { id: number; title: string; summary: string }[] = [];
  for (const line of structureRaw.split("\n")) {
    const m = line.match(/\*\*Scene\s+(\d+)\s*[:—–-]?\s*(.+?)\*\*\s*[:—–-]?\s*(.+)/i);
    if (m) sceneTitles.push({ id: parseInt(m[1]), title: m[2].trim(), summary: m[3].trim() });
  }
  if (sceneTitles.length === 0) return false;

  // PHASE 2: Depth
  const sceneNotes: Map<number, string> = new Map();
  for (const s of sceneTitles) {
    const depthPrompt = `Story architect mode. Detail Scene ${s.id}: "${s.title}" for Ch${ch.id}.
Summary: ${s.summary}
${lore}

WRITE DEEP NOTES (Setting, Characters, Action, Dialogue Subtext, Sensory detail, Thematic hook).
Format: **Scene ${s.id}: ${s.title}**
...
STOP.`;
    const notes = await captureWithRetry(marie, depthPrompt, log, ch.id, "SKELETON", `Notes: ${s.title}`, 100);
    if (notes) sceneNotes.set(s.id, notes);
    await sleep(3000);
  }

  // PHASE 3: Metadata
  const metaPrompt = `Write Chapter ${ch.id} thematic core, foreshadowing, and character arcs. STOP.`;
  const metaRaw = await captureWithRetry(marie, metaPrompt, log, ch.id, "SKELETON", "Metadata", 50);

  // PHASE 4: Assembly
  const assembled: string[] = [`# Chapter ${ch.id}: ${ch.title} — SKELETON\n\n`];
  for (const s of sceneTitles) {
    assembled.push(sceneNotes.get(s.id) || `**Scene ${s.id}: ${s.title}**\n*(Notes missing)*`);
    assembled.push("\n\n---\n\n");
  }
  if (metaRaw) assembled.push(metaRaw);

  await fs.writeFile(targetPath, assembled.join(""));
  return sceneNotes.size > 0;
}

/**
 * Pass: FLESH (Scene by Scene)
 */
async function passFlesh(
  marie: MarieCLI,
  ch: any,
  targetPath: string,
  log: Log,
  prevSummaries: string,
  lore: string,
  feedback: string = "",
): Promise<boolean> {
  const skeleton = await readSafe(targetPath);
  const scenes = parseScenes(skeleton);
  const thematic = extractThematicNotes(skeleton);
  const targetScenes = scenes.length > 0 ? scenes : [{ id: 1, title: ch.title, notes: skeleton }];

  const sceneProse: Map<number, string> = new Map();
  let lastSnippet = "";

  for (const scene of targetScenes) {
    const prompt = `Novelist mode. Write prose for Ch${ch.id}, Scene ${scene.id}: "${scene.title}".
${lore}
${prevSummaries ? `STORY SO FAR:\n${prevSummaries}\n` : ""}
${thematic ? `THEMATIC CONTEXT:\n${thematic}\n` : ""}
${feedback ? `EDITOR FEEDBACK:\n${feedback}\n` : ""}
${lastSnippet ? `PREVIOUS SCENE ENDED:\n"...${lastSnippet}"\n` : ""}

NOTES: ${scene.notes.trim()}

Write 400-600 words of immersive prose. STOP.`;

    const captured = await captureWithRetry(marie, prompt, log, ch.id, "FLESH", `Scene ${scene.id}`, 100);
    if (captured) {
      sceneProse.set(scene.id, captured);
      const w = captured.split(/\s+/);
      lastSnippet = w.slice(-300).join(" ");
    }
    await sleep(4000);
  }

  const parts = [`# Chapter ${ch.id}: ${ch.title}\n\n`];
  for (const scene of targetScenes) {
    parts.push(`## Scene ${scene.id}: ${scene.title}\n\n${sceneProse.get(scene.id) || "*[Pending]*"}\n\n---\n\n`);
  }
  await fs.writeFile(targetPath, parts.join(""));
  return true;
}

/**
 * Pass: NERVE (Expansion with Self-Critique)
 */
async function passNerve(
  marie: MarieCLI,
  ch: any,
  targetPath: string,
  log: Log,
  lore: string,
  feedback: string = "",
): Promise<boolean> {
  const content = await readSafe(targetPath);
  const sections = splitSections(content);
  const expanded: string[] = [];

  for (const section of sections) {
    const prompt = `Editor mode. EXPAND this prose (+200-400 words).
${lore}
${feedback ? `EDITOR FEEDBACK: ${feedback}\n` : ""}
PROSE:
---
${section.content}
---
RULES: Add sensory depth, subtext, world-building. Keep original text.
SELF-CRITIQUE: Before finishing, ensure you added at least 3 new sensory details.
Output expanded prose only. STOP.`;

    const captured = await captureWithRetry(marie, prompt, log, ch.id, "NERVE", `Expand ${section.id}`, countWords(section.content));
    expanded.push(captured || section.content);
    await sleep(4000);
  }

  await fs.writeFile(targetPath, expanded.join("\n\n"));
  return true;
}

/**
 * Pass: SOUL (Polish with Voice Alignment)
 */
async function passSoul(
  marie: MarieCLI,
  ch: any,
  targetPath: string,
  log: Log,
  lore: string,
  feedback: string = "",
): Promise<boolean> {
  const content = await readSafe(targetPath);
  const sections = splitSections(content);
  const polished: string[] = [];

  for (const section of sections) {
    const prompt = `Literary Alchemist mode. POLISH this prose.
${lore}
${feedback ? `EDITOR FEEDBACK: ${feedback}\n` : ""}
PROSE:
---
${section.content}
---
ALIGNMENT: Ensure narrative voice matches Lore. Strengthen hooks.
SELF-CRITIQUE: Check for clichés and redundancies.
Output polished prose only. STOP.`;

    const captured = await captureWithRetry(marie, prompt, log, ch.id, "SOUL", `Polish ${section.id}`, Math.floor(countWords(section.content) * 0.8));
    polished.push(captured || section.content);
    await sleep(4000);
  }

  await fs.writeFile(targetPath, polished.join("\n\n"));
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

// ═══════════════════════════════════════════════════════════════
//  MAIN
// ═══════════════════════════════════════════════════════════════

async function main() {
  const workingDir = process.cwd();
  const structurePath = path.join(workingDir, ".marie", "novel_structure.json");
  const log = new Log(workingDir);

  process.stdout.write("🔮 Novel Pipeline v4 — Lore-Aware Production Engine\n\n");

  let marie: MarieCLI;
  try {
    marie = new MarieCLI(workingDir);
    process.stdout.write("✅ MarieCLI initialized.\n");
  } catch (err: any) {
    process.stderr.write(`❌ MarieCLI: ${err.message}\n`);
    process.exit(1);
  }

  // Init structure from lightnovel.md if missing
  try {
    await fs.access(structurePath);
  } catch {
    process.stdout.write("🚀 Initializing from lightnovel.md...\n");
    const outline = await fs.readFile(path.join(workingDir, "lightnovel.md"), "utf-8");
    const chapters: any[] = [];
    let cur: any = null;
    for (const line of outline.split("\n")) {
      const m = line.match(/^Chapter \d+ — (.+)/);
      if (m) { if (cur) chapters.push(cur); cur = { title: m[1], description: "" }; }
      else if (cur && line.trim() && !line.startsWith("Arc")) cur.description += line.trim() + " ";
    }
    if (cur) chapters.push(cur);
    const svc = new NovelProductionService(workingDir);
    (svc as any).structure = { volumes: [{ id: 1, title: "Volume I", status: "DRAFT", chapters: [] }] };
    await svc.save();
    for (const c of chapters) await svc.startNewChapter(c.title, c.description.trim());
  }

  const attempts = new Map<string, number>();
  let lastCritique = "";

  while (true) {
    let structure = JSON.parse(await fs.readFile(structurePath, "utf-8"));
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
      lastCritique = "";
      continue;
    }

    const targetPath = path.join(workingDir, ".vault", "novel", "chapters", `Chapter_${ch.id}_${ch.title.replace(/[^a-zA-Z0-9]/g, "_")}.md`);
    await fs.mkdir(path.dirname(targetPath), { recursive: true });

    const lore = await getLore(workingDir);
    const prevSummaries = vol.chapters.filter((c: any) => c.id < ch.id && c.continuityLedger.length > 0)
      .map((c: any) => `Ch${c.id} "${c.title}": ${c.continuityLedger[c.continuityLedger.length - 1]?.summary || ""}`)
      .join("\n");

    process.stdout.write(`\n📖 Ch${ch.id}: "${ch.title}" | ${pass} | Attempt ${attempt}/3\n\n`);

    let passOk = false;
    try {
      switch (pass) {
        case "SKELETON": passOk = await passSkeleton(marie, ch, targetPath, log, lore, lastCritique); break;
        case "FLESH":    passOk = await passFlesh(marie, ch, targetPath, log, prevSummaries, lore, lastCritique); break;
        case "NERVE":    passOk = await passNerve(marie, ch, targetPath, log, lore, lastCritique); break;
        case "SOUL":     passOk = await passSoul(marie, ch, targetPath, log, lore, lastCritique); break;
        default: passOk = true;
      }
    } catch (err: any) { await log.write(ch.id, pass, `Error: ${err.message}`); }

    if (passOk) {
      const result = await advanceDirect(workingDir, log, ch, pass, `${pass} complete. ${countWords(await readSafe(targetPath))} words.`);
      if (result.success) { attempts.delete(key); lastCritique = ""; }
      else lastCritique = result.message;
    }
    await sleep(8000);
  }
}

main().catch(err => {
  process.stderr.write(`\n💥 Fatal: ${err.message || err}\n`);
  process.exit(1);
});
