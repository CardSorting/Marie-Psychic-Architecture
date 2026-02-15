import * as fs from "node:fs/promises";
import * as path from "path";
import { AscensionDecree, AscensionState } from "../core/MarieAscensionTypes.js";

/**
 * Service to maintain the 'CHRONICLES.md' Saga.
 * Appends 'Light Novel' style chapter summaries upon significant events.
 */
export class ChronicleService {
    private static readonly CHRONICLE_FILE = "CHRONICLES.md";

    public async logVictory(decree: AscensionDecree, state: AscensionState, rootPath: string): Promise<void> {
        const timestamp = new Date().toISOString();
        const chapterId = Math.floor(Math.random() * 10000); // Simple ID

        // Deadpan Epic Title Generator
        const titles = [
            "The Deployment of the Immutable Artifact",
            "The Refactoring of the Ancient Ones",
            "The Silence of the Linter",
            "The Triumph of the Type Checker",
            "The Async Await of Destiny",
            "The Merge Conflict of Souls",
        ];
        const title = titles[Math.floor(Math.random() * titles.length)];

        const entry = `
## Chapter ${chapterId}: ${title}
*Stardate: ${timestamp} | Spirit Pressure: ${state.spiritPressure}% | Streak: ${state.victoryStreak}*

**The Oracle's Decree:**
> "${decree.raw.split('\n')[0].substring(0, 100)}..."

**The Outcome:**
The Hero executed the **${decree.strategy}** protocol with **${decree.urgency}** urgency.
Through the **${decree.ghostwriterMode || 'UNKNOWN'}** mode, order was restored to the Cathedral.
Narrative Integrity holds at ${(state.ghostwriterMemory?.semanticFidelityScore || 1.0) * 100}%.

---
`;

        try {
            const chroniclePath = path.join(rootPath, ChronicleService.CHRONICLE_FILE);
            await fs.appendFile(chroniclePath, entry, "utf-8");
            console.log(`[ChronicleService] As it is written, so it shall be. (Chapter ${chapterId} logged)`);
        } catch (e) {
            console.error("Failed to log chronicle:", e);
        }
    }
}
