
import { MarieEngine } from "../src/monolith/infrastructure/ai/core/MarieEngine.js";
import * as fs from "node:fs/promises";
import * as path from "path";

const MEMORY_FILE = ".marie/ghostwriter_memory.json";
const BACKUP_FILE = ".marie/ghostwriter_memory.json.bak";

async function verifyPersistence() {
    console.log("🧪 Starting Narrative Persistence Verification...");
    let backupCreated = false;

    try {
        // Backup
        try {
            await fs.access(MEMORY_FILE);
            await fs.rename(MEMORY_FILE, BACKUP_FILE);
            backupCreated = true;
            console.log("📦 Backed up existing memory file.");
        } catch (e) { }

        const mockProvider = {} as any;
        const mockRegistry = { getTool: () => ({}) } as any;
        const mockApproval = async () => true;

        console.log("🚀 Initializing Engine 1...");
        const engine1 = new MarieEngine(mockProvider, mockRegistry, mockApproval);

        await new Promise(resolve => setTimeout(resolve, 200));

        console.log("📝 Modifying Memory...");
        const state1 = (engine1 as any).state; // Type is any now

        if (!state1 || !state1.ghostwriterMemory) {
            throw new Error("State or Memory missing!");
        }

        state1.ghostwriterMemory.characterBible = [
            {
                name: "Fabian",
                archetype: "The Technomancer",
                voice: "Cynical",
                emotionalState: "Detached"
            }
        ];
        state1.ghostwriterMemory.worldLexicon = {
            terms: { "Ether": "Digital soul" },
            laws: ["Code is law"],
            geography: ["The Silicon Spire"]
        };

        console.log("💾 Saving Memory...");
        await (engine1 as any).saveGhostwriterMemory();

        console.log("🚀 Initializing Engine 2...");
        const engine2 = new MarieEngine(mockProvider, mockRegistry, mockApproval);

        await new Promise(resolve => setTimeout(resolve, 200));

        console.log("🔍 Verifying Data...");
        const state2 = (engine2 as any).state;
        const char = state2.ghostwriterMemory.characterBible?.[0];
        const term = state2.ghostwriterMemory.worldLexicon?.terms?.["Ether"];

        if (char?.name === "Fabian") {
            console.log("✅ Persistence VALIDATED: Found 'Fabian'.");
        } else {
            throw new Error("Persistence FAILED: character is " + JSON.stringify(char));
        }

        if (term === "Digital soul") {
            console.log("✅ Persistence VALIDATED: Found 'Ether' term.");
        } else {
            throw new Error("Persistence FAILED: term is " + JSON.stringify(term));
        }

        console.log("🎉 VERIFICATION PASSED!");

    } catch (e) {
        console.error("❌ Test Failed:", e);
        process.exit(1);
    } finally {
        // Cleanup
        try {
            await fs.unlink(MEMORY_FILE);
            if (backupCreated) await fs.rename(BACKUP_FILE, MEMORY_FILE);
            console.log("🧹 Cleanup complete.");
        } catch (e) { }
    }
}

verifyPersistence();
