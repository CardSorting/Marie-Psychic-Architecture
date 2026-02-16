import * as fs from "node:fs/promises";
import * as path from "node:path";
import { MarieCLI } from "../../../adapters/CliMarieAdapter.js";
import { Log } from "./ProductionLogger.js";

export function countWords(text: string): number {
    return text.split(/\s+/).filter((w) => w.length > 0).length;
}

export async function readSafe(filePath: string): Promise<string> {
    try {
        return await fs.readFile(filePath, "utf-8");
    } catch {
        return "";
    }
}

export function sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
}

/** Clean up captured stream — remove tool call artifacts, code fences, etc. */
export function cleanStreamOutput(raw: string): string {
    let text = raw;
    text = text.replace(/^```(?:json|markdown|md)?\s*\n/gm, "");
    text = text.replace(/\n```\s*$/gm, "");
    text = text.replace(/\n*(?:Now I (?:STOP|stop)|I'll stop here|That's all)\.?\s*$/g, "");
    return text.trim();
}

/** Robustly extract JSON block from text even if it has preamble. 
 * Supports basic recovery for truncated JSON. */
export function extractJSON(text: string): any {
    process.stdout.write(`   [DEBUG] extractJSON start char: '${text.substring(0, 10)}...' end: '...${text.substring(text.length - 10)}'\n`);

    // 1. Strip Markdown code fences if present
    let cleaned = text.trim();
    if (cleaned.includes("```json")) {
        cleaned = cleaned.split("```json")[1].split("```")[0].trim();
    } else if (cleaned.includes("```")) {
        cleaned = cleaned.split("```")[1].split("```")[0].trim();
    }

    let jsonBody = "";
    const start = cleaned.indexOf("{");
    if (start === -1) return null;

    const end = cleaned.lastIndexOf("}");
    if (end !== -1 && end > start) {
        jsonBody = cleaned.substring(start, end + 1);
    } else {
        // Truncated! Attempt recovery
        jsonBody = repairJSON(cleaned.substring(start));
    }

    try {
        return JSON.parse(jsonBody);
    } catch (err: any) {
        process.stdout.write(`   [DEBUG] JSON.parse primary fail: ${err.message}\n`);
        // Second attempt: brutal extraction
        try {
            const possible = jsonBody + "}";
            return JSON.parse(possible);
        } catch {
            return null;
        }
    }
}

export function repairJSON(truncated: string): string {
    let balanced = truncated.trim();

    // 1. Balance quotes
    const quoteCount = (balanced.match(/"/g) || []).length;
    if (quoteCount % 2 !== 0) balanced += '"';

    // 2. Balance braces
    let depth = 0;
    for (const char of balanced) {
        if (char === "{") depth++;
        if (char === "}") depth--;
    }
    while (depth > 0) {
        balanced += "}";
        depth--;
    }

    return balanced;
}

export async function captureAgentOutput(
    marie: MarieCLI,
    prompt: string,
    streamToFile?: string,
    append: boolean = false
): Promise<string> {
    const chunks: string[] = [];
    if (streamToFile) {
        await fs.mkdir(path.dirname(streamToFile), { recursive: true });
        if (!append) {
            await fs.writeFile(streamToFile, ""); // clear only if not appending
        }
    }

    await marie.handleMessage(prompt, {
        onStream: async (chunk) => {
            if (chunks.length === 0) process.stdout.write(`   [DEBUG] First chunk received (len: ${chunk.length})\n`);
            chunks.push(chunk);
            process.stdout.write(chunk);
            if (streamToFile) {
                await fs.appendFile(streamToFile, chunk);
            }
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

export async function captureWithRetry(
    marie: MarieCLI,
    prompt: string,
    log: Log,
    ch: number,
    pass: string,
    label: string,
    minWords: number = 50,
    maxRetries: number = 2,
    streamFile?: string
): Promise<string> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        let finalPrompt = attempt === 1 ? prompt : `${prompt}\n\nCRITICAL: RESPONSE TOO SHORT. Must be > ${minWords} words. Attempt ${attempt}/${maxRetries}.`;
        let resumption = false;

        // RESUMPTION LOGIC
        if (streamFile) {
            const existing = await readSafe(streamFile);
            if (existing.length > 200 && countWords(existing) < minWords) {
                await log.write(ch, pass, `${label}: ⚡ RESUMING truncated stream (${countWords(existing)}w / target ${minWords}w)...`);
                finalPrompt = `You were generating content for: ${label}.
The stream was interrupted. 
HERE IS THE CONTENT GENERATED SO FAR:
---
${existing}
---
PLEASE CONTINUE EXACTLY FROM THE LAST WORD. 
Do NOT repeat the start. Do NOT preamble.
Just deliver the rest of the text until complete.`;
                resumption = true;
            }
        }

        process.stdout.write(`   [DEBUG] Attempt ${attempt}: Resumption=${resumption}, Stream=${streamFile || "None"}\n`);

        let captured = "";
        try {
            captured = await captureAgentOutput(marie, finalPrompt, streamFile, resumption);
            process.stdout.write(`   [DEBUG] Captured response length: ${captured.length}\n`);
        } catch (err: any) {
            await log.write(ch, pass, `${label}: agent error (${err.message})`);
        }

        // If we resumed, the "captured" is just the new part. We need the full thing for word count and return.
        let fullText = captured;
        if (resumption && streamFile) {
            fullText = await readSafe(streamFile);
        }

        // Heuristic: If we expect JSON, don't count words the same way
        if (label.includes("JSON") || label.includes("Blueprint")) {
            const parsed = extractJSON(fullText);
            if (parsed) {
                process.stdout.write(`   [DEBUG] JSON Extraction Success.\n`);
                return fullText;
            } else {
                process.stdout.write(`   [DEBUG] JSON Extraction FAILED for text (len ${fullText.length}).\n`);
            }
        }

        const words = countWords(fullText);
        if (words >= minWords) {
            await log.write(ch, pass, `${label}: captured ${words}w`);
            return fullText;
        }

        if (attempt < maxRetries) {
            await log.write(ch, pass, `${label}: too short (${words}w). Retry ${attempt + 1}...`);
            await sleep(3000);
        }
    }

    await log.write(ch, pass, `${label}: failed after ${maxRetries} retries`);
    return "";
}
