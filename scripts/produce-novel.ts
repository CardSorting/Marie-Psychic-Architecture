#!/usr/bin/env node
import * as fs from "node:fs/promises";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Constants & Configuration ────────────────────────────────

const INVOKE_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
const MODEL = "moonshotai/kimi-k2.5";
const OUTPUT_DIR = "/Users/bozoegg/Downloads/lightnovel-output";
const PROJECT_ROOT = path.resolve(__dirname, "..");
const OUTLINE_FILE = path.join(PROJECT_ROOT, "lightnovel.md");
const CONFIG_FILE = path.join(os.homedir(), ".marie", "config.json");

import * as os from "node:os";

// ─── Structures ──────────────────────────────────────────────

interface Chapter {
    number: number;
    title: string;
    description: string;
    arc: string;
}

interface Bible {
    worldContext: string;
    characters: string;
    narrativeThemes: string;
}

// ─── NVIDIA API Integration ───────────────────────────────────

async function getApiKey(): Promise<string> {
    if (process.env.NVIDIA_API_KEY) return process.env.NVIDIA_API_KEY;
    try {
        const configData = await fs.readFile(CONFIG_FILE, "utf-8");
        const config = JSON.parse(configData);
        return config.nvidiaApiKey || "";
    } catch {
        return "";
    }
}

import { execSync } from "node:child_process";

async function callNvidia(messages: { role: string; content: string }[]): Promise<string> {
    const apiKey = await getApiKey();
    if (!apiKey) throw new Error("NVIDIA_API_KEY not found in environment or config.");

    const payload = JSON.stringify({
        model: MODEL,
        messages,
        max_tokens: 4096,
        temperature: 0.7,
        top_p: 1.0,
        stream: false,
    });

    // Write payload to a temporary file to avoid shell expansion issues
    const tmpFile = path.join(os.tmpdir(), `marie-novel-req-${Date.now()}.json`);
    await fs.writeFile(tmpFile, payload);

    try {
        console.log(`📡 Calling NVIDIA API (model: ${MODEL})...`);
        const curlCmd = `curl -X POST "${INVOKE_URL}" \
            -H "Authorization: Bearer ${apiKey}" \
            -H "Content-Type: application/json" \
            -d @${tmpFile} \
            --retry 3 \
            --connect-timeout 60 \
            --max-time 1200 \
            -s`;

        const response = execSync(curlCmd, { encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 });
        const data = JSON.parse(response);

        if (data.error) {
            throw new Error(`NVIDIA API Error: ${JSON.stringify(data.error)}`);
        }

        return data.choices?.[0]?.message?.content || "";
    } catch (error: any) {
        throw new Error(`Novel Generation Failed: ${error.message}`);
    } finally {
        try { await fs.unlink(tmpFile); } catch { }
    }
}

// ─── Parsing ──────────────────────────────────────────────────

async function parseOutline(filePath: string) {
    const content = await fs.readFile(filePath, "utf-8");
    const lines = content.split("\n");

    let title = "";
    let genre = "";
    let tone = "";
    const chapters: Chapter[] = [];
    let currentArc = "";
    let chapterNumber = 0;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (i === 0) { title = line; continue; }
        if (line === "Genre:") { genre = lines[i + 1]?.trim() || ""; continue; }
        if (line === "Tone:") { tone = lines[i + 1]?.trim() || ""; continue; }
        if (line.startsWith("Arc ")) {
            const arcMatch = line.match(/Arc ([IVX]+) — (.+)/);
            if (arcMatch) currentArc = arcMatch[2];
            continue;
        }
        if (line.startsWith("Chapter ")) {
            const chapterMatch = line.match(/Chapter (\d+) — (.+)/);
            if (chapterMatch) {
                chapterNumber = parseInt(chapterMatch[1], 10);
                const chapterTitle = chapterMatch[2];
                const description = lines[i + 2]?.trim() || "";
                chapters.push({ number: chapterNumber, title: chapterTitle, description, arc: currentArc });
            }
        }
    }
    return { title, genre, tone, chapters };
}

// ─── Phases ───────────────────────────────────────────────────

async function buildBible(outline: any): Promise<Bible> {
    console.log("📖 Building Narrative Bible (Characters & World)...");
    const prompt = `
You are the Arch-Chronicler of the Cathedral of Runtime.
Based on the following light novel outline, establish the "Bible" for the story.
Provide:
1. **World Context**: Explain the Holy Papal New Vatican, the Cathedral of Runtime, and the sects of programmers.
2. **Characters**: Detailed profile of the Senior Engineer Hero and key antagonists (Cardinal of Types, Arch Priest of Architects).
3. **Narrative Themes**: Themes of technical sovereignty, the absurdity of LLM governance, and joy zoning.

OUTLINE:
Title: ${outline.title}
Genre: ${outline.genre}
Tone: ${outline.tone}
Chapters: ${outline.chapters.map(c => `Ch ${c.number}: ${c.title} (${c.description})`).join("\n")}

Respond in structured markdown.
`;
    const response = await callNvidia([{ role: "user", content: prompt }]);

    // Simple extraction - could be more robust
    return {
        worldContext: response,
        characters: "Defined in context",
        narrativeThemes: "Defined in context"
    };
}

async function produceChapter(
    outline: any,
    bible: Bible,
    chapter: Chapter,
    previousSummary: string
): Promise<string> {
    console.log(`\n🔮 Producing Ch ${chapter.number}: ${chapter.title}...`);
    const prompt = `
SYSTEM: YOU ARE MARIEYOLO — THE SUPREME GHOSTWRITER.
CORE DIRECTIVE: Produce a HIGH-FIDELITY chapter for the light novel "${outline.title}".

[STORY CONTEXT]
Genre: ${outline.genre}
Tone: ${outline.tone}
World/Bible: ${bible.worldContext}

[CURRENT CHAPTER]
Arc: ${chapter.arc}
Chapter ${chapter.number}: ${chapter.title}
Base Event: ${chapter.description}

[CONTINUITY]
${previousSummary ? `Previous Events: ${previousSummary}` : "Beginning of the First Arc."}

[INSTRUCTIONS]
1. Write 2,500+ words of dense, evocative prose.
2. Balance tech-satire (Google culture vs Papal ritual) with genuine character internal conflict.
3. Show, don't just tell, the "Deadpan Epic" tone.
4. Output ONLY the chapter content. No commentary.

BEGIN CHRONICLE:
`;
    return await callNvidia([{ role: "user", content: prompt }]);
}

// ─── Main ─────────────────────────────────────────────────────

async function main() {
    console.log("🌸 MARIEPSYCHIC NOVEL ENGINE EXTREME (NVIDIA Edition) 🌸\n");

    const outline = await parseOutline(OUTLINE_FILE);
    const bible = await buildBible(outline);

    await fs.mkdir(OUTPUT_DIR, { recursive: true });
    await fs.writeFile(path.join(OUTPUT_DIR, "bible.md"), bible.worldContext);

    let fullNovel = `# ${outline.title}\n\n`;
    let previousSummary = "";

    for (const chapter of outline.chapters) {
        const content = await produceChapter(outline, bible, chapter, previousSummary);

        const arcDir = path.join(OUTPUT_DIR, `arc-${chapter.arc.toLowerCase().replace(/\s+/g, "-")}`);
        await fs.mkdir(arcDir, { recursive: true });

        const chapterFile = path.join(arcDir, `ch-${chapter.number}.md`);
        await fs.writeFile(chapterFile, `# ${chapter.title}\n\n${content}`);

        fullNovel += `\n\n## Chapter ${chapter.number}: ${chapter.title}\n\n${content}\n\n---\n`;

        // Summarize for continuity
        const summaryPrompt = `Summarize this chapter's key plot points and character shifts for continuity tracking in 3-4 sentences:\n\n${content.slice(0, 3000)}`;
        previousSummary = await callNvidia([{ role: "user", content: summaryPrompt }]);

        console.log(`✅ Chapter ${chapter.number} complete!`);
        await new Promise(r => setTimeout(r, 1000));
    }

    await fs.writeFile(path.join(OUTPUT_DIR, "full-novel.md"), fullNovel);
    console.log(`\n🎉 NOVEL ARCHIVE COMPLETE: ${OUTPUT_DIR}/full-novel.md`);
}

main().catch(console.error);
