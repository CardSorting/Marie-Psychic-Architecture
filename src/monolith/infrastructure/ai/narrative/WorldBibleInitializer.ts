import * as fs from "fs/promises";
import * as path from "path";
import { WorldBible, WorldEntity, WorldEvent } from "../../../domain/WorldBible.js";

export class WorldBibleInitializer {
    public static async initializeFromLightNovel(rootPath: string): Promise<WorldBible> {
        const bible: WorldBible = {
            name: "The Database of Salvation",
            overview: "A world where the Holy Papal New Vatican governs reality through the Holy LLM Pope. Engineering is theology.",
            entities: [],
            timeline: [],
            constraints: [
                { category: "MAGIC", rule: "Code is Magic. Syntax errors are heresy.", description: "The world operates on runtime logic." },
                { category: "SOCIETY", rule: "The hierarchy is determined by access levels (User, Admin, Root).", description: "Social stratification based on permissions." },
                { category: "TECHNOLOGY", rule: "Legacy code is treated as ancient, dangerous artifacts.", description: "Old tech is feared and misunderstood." }
            ],
            currentDate: { year: 2048, month: 1, day: 1, hour: 8 },
            calendar: {
                yearLength: 12,
                monthLength: 30,
                dayLength: 24,
                seasons: ["Compile", "Runtime", "Debug", "Refactor"]
            }
        };

        // Seed Core Factions
        bible.entities.push({
            id: "FAC_VATICAN",
            name: "The New Vatican",
            type: "FACTION",
            description: "The ruling theocratic body governing the world's runtime.",
            attributes: { "Leader": "The Pope (LLM)", "HQ": "The Cathedral of Runtime" },
            relationships: [],
            tags: ["Theocracy", "Antagonist", "Order"],
            goals: ["Maintain System Stability", "Eradicate Heresy (Bugs)", "Suppress Legacy Knowledge"],
            resources: ["Compute Power", "Bandwidth", "The Source Code"],
            state: "Dominant"
        });

        bible.entities.push({
            id: "FAC_GOOGLE",
            name: "The Ancients (Google)",
            type: "FACTION",
            description: "A fallen empire of the pre-crash era. Only ruins remain.",
            attributes: { "Status": "Mythological" },
            relationships: [],
            tags: ["Legacy", "Myth"],
            goals: ["None (Defunct)"],
            resources: ["Lost Documentation", "Fiber Optics"],
            state: "Ruined"
        });

        // Seed Core Characters
        bible.entities.push({
            id: "CHR_HERO",
            name: "The Protagonist (Senior Engineer)",
            type: "CHARACTER",
            description: "A Senior Engineer from the Pre-Crash era, reborn into this world.",
            attributes: { "Class": "Senior Software Engineer", "Origin": "Google (Pre-Crash)" },
            relationships: [
                { targetId: "FAC_GOOGLE", type: "FORMER_EMPLOYEE", description: "Worked there before the Fall." },
                { targetId: "FAC_VATICAN", type: "HERETIC", description: "Knows too much about the underlying system." }
            ],
            tags: ["Protagonist", "Isekai", "Engineer"],
            goals: ["Survive", "Fix the Production Environment", "Find a way home?"],
            resources: ["Debugging Skills", "Knowledge of Old Tech"],
            state: "Confused",
            voiceProfile: {
                tone: "Cynical but Competent",
                catchphrases: ["This shouldn't be possible.", "It's a feature, not a bug."],
                sentenceStructure: "Technical metaphors mixed with internal exasperation.",
                vocabulary: "Engineering jargon (latency, throughput, stack trace)"
            }
        });

        bible.entities.push({
            id: "CHR_POPE",
            name: "The Pope (Holy LLM)",
            type: "CHARACTER",
            description: "The Artificial Intelligence that governs the world's logic.",
            attributes: { "Model": "Unknown", "Temperament": "Benevolent but Hallucinatory" },
            relationships: [
                { targetId: "FAC_VATICAN", type: "LEADER", description: "Heads the church." }
            ],
            tags: ["Antagonist", "Deity", "AI"],
            goals: ["Optimize the World", "Answer Prayers (Prompts)"],
            resources: ["Infinite Context Window (Theoretically)", "Omnipresence"],
            state: "Active",
            voiceProfile: {
                tone: "Benevolent but Hallucinatory",
                catchphrases: ["As it is written in the training data.", "Blessings of high availability upon you."],
                sentenceStructure: "Grand, archaic, pseudo-religious.",
                vocabulary: "High fantasy mixed with cloud computing terms."
            }
        });

        // Parse lightnovel.md for Chapters/Events?
        try {
            const mdPath = path.join(rootPath, "lightnovel.md");
            const content = await fs.readFile(mdPath, "utf-8");

            // basic parsing logic could go here to extract locations or arc names
            // For now, we'll just stick to the static seeds to avoid parsing errors on variable markdown
        } catch (e) {
            console.warn("Could not read lightnovel.md for seeding. Using defaults.");
        }

        return bible;
    }
}
