
import { NarrativeAutomationService, HardeningPhase } from "../src/monolith/services/NarrativeAutomationService.js";
import { ConfigService } from "../src/monolith/infrastructure/config/ConfigService.js";
import * as fs from "fs/promises";
import * as path from "path";

async function verifyHardening() {
    console.log("🧪 Starting Narrative Hardening Verification...");
    const testFile = "test_narrative.md";

    // Setup
    await fs.writeFile(testFile, "# Chapter 1\nThe hero walked into the bar.", "utf-8");

    const mockContext = {} as any;
    const mockJoyService = { addAchievement: async () => { } } as any;

    const service = new NarrativeAutomationService(mockContext, mockJoyService);

    // Mock Provider Factory
    const mockProvider = {
        createMessage: async (params: any) => {
            console.log(`🤖 AI Called with prompt length: ${params.messages[0].content.length}`);
            return {
                content: "AI Generated Content for " + params.messages[0].content.substring(0, 20) + "...",
                role: "assistant"
            };
        }
    };

    service.registerProviderFactory(() => mockProvider as any);

    try {
        // Test Atomic Extraction
        console.log("Testing ATOMIC_EXTRACTION...");
        const result = await service.performHardening(testFile, HardeningPhase.ATOMIC_EXTRACTION, "Extract claims");
        console.log("Result:", result);

        // Verify Artifact
        const artifactPath = "test_narrative.claims.md";
        const exists = await fs.access(artifactPath).then(() => true).catch(() => false);

        if (exists) {
            console.log("✅ Artifact created:", artifactPath);
            const content = await fs.readFile(artifactPath, "utf-8");
            console.log("Artifact Content:", content);
        } else {
            throw new Error("Artifact not found!");
        }

    } catch (e) {
        console.error("❌ Test Failed:", e);
    } finally {
        // Cleanup
        try {
            await fs.unlink(testFile);
            await fs.unlink("test_narrative.claims.md");
        } catch (e) { }
    }
}

verifyHardening();
