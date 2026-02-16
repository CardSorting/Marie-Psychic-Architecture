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

/** Robustly extract JSON block from text even if it has preamble */
export function extractJSON(text: string): any {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1) return null;
    const jsonBody = text.substring(start, end + 1);
    try {
        return JSON.parse(jsonBody);
    } catch {
        return null;
    }
}

export async function captureAgentOutput(
    marie: MarieCLI,
    prompt: string,
    streamToFile?: string
): Promise<string> {
    const chunks: string[] = [];
    if (streamToFile) {
        await fs.mkdir(path.dirname(streamToFile), { recursive: true });
        await fs.writeFile(streamToFile, ""); // clear
    }

    await marie.handleMessage(prompt, {
        onStream: async (chunk) => {
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
        const finalPrompt = attempt === 1 ? prompt : `${prompt}\n\nCRITICAL: RESPONSE TOO SHORT. Must be > ${minWords} words. Attempt ${attempt}/${maxRetries}.`;

        let captured = "";
        try {
            captured = await captureAgentOutput(marie, finalPrompt, streamFile);
        } catch (err: any) {
            await log.write(ch, pass, `${label}: agent error (${err.message})`);
        }

        // Heuristic: If we expect JSON, don't count words the same way
        if (label.includes("JSON") || label.includes("Blueprint")) {
            if (captured.trim().startsWith("{") && captured.trim().endsWith("}")) return captured;
        }

        const words = countWords(captured);
        if (words >= minWords) {
            await log.write(ch, pass, `${label}: captured ${words}w`);
            return captured;
        }

        if (attempt < maxRetries) {
            await log.write(ch, pass, `${label}: too short (${words}w). Retry ${attempt + 1}...`);
            await sleep(3000);
        }
    }

    await log.write(ch, pass, `${label}: failed after ${maxRetries} retries`);
    return "";
}
