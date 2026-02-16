import * as fs from "node:fs/promises";
import { MarieCLI } from "../../../../adapters/CliMarieAdapter.js";
import { Log } from "../ProductionLogger.js";
import { captureWithRetry } from "../ProductionUtils.js";

interface EngagementReport {
    boredomIndex: number; // 1-10 (10 is intolerable)
    confusionScore: number; // 1-10
    emotionalImpact: number; // 1-10
    shippingForecast: string; // "Rising", "Sinking", "Stabilized"
    plotHoles: string[];
    verdict: "PUBLISH" | "REVISE" | "BURN";
}

export async function passReception(
    marie: MarieCLI,
    prosePath: string,
    log: Log,
    chapterId: number
): Promise<boolean> {
    const prose = await fs.readFile(prosePath, "utf-8");

    const prompt = `Simulated Reader Mode. Read the following chapter draft.
    
    TEXT:
    ${prose.slice(0, 15000)} // Limit context if needed, but read as much as possible.
    
    TASK:
    You are a brutally honest Beta Reader. Analyze the chapter for:
    1. BOREDOM: Is it a slog?
    2. CONFUSION: Do I know who is talking? Where we are?
    3. FEELS: Did I care?
    
    OUTPUT JSON:
    {
        "boredomIndex": number,
        "confusionScore": number,
        "emotionalImpact": number,
        "shippingForecast": "string",
        "plotHoles": ["string"],
        "verdict": "PUBLISH" | "REVISE" | "BURN"
    }`;

    const raw = await captureWithRetry(marie, prompt, log, chapterId, "RECEPTION", "Beta Read", 100);

    try {
        const report: EngagementReport = JSON.parse(raw);
        await log.write(chapterId, "RECEPTION", `Verdict: ${report.verdict} (Boredom: ${report.boredomIndex}/10, Impact: ${report.emotionalImpact}/10)`);

        if (report.verdict === "BURN" || report.boredomIndex > 7) {
            await log.write(chapterId, "RECEPTION", `❌ Chapter REJECTED by Beta Reader. Too boring/broken.`);
            return false;
        }

        if (report.plotHoles.length > 0) {
            await log.write(chapterId, "RECEPTION", `⚠️ Plot Holes Detected: ${report.plotHoles.join("; ")}`);
        }

        return true;
    } catch {
        await log.write(chapterId, "RECEPTION", "Failed to parse Reader Report. Assuming pass.");
        return true;
    }
}
