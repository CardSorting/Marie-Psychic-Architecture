import {
  NarrativeAutomationService,
  HardeningPhase,
} from "../src/monolith/services/NarrativeAutomationService.js";
import * as fs from "fs/promises";
import * as path from "path";

const TEST_FILE = "deep_test.md";
const MEMORY_FILE = ".marie/ghostwriter_memory.json";

async function verifyDeepHardening() {
  console.log("🧪 Starting Deep Hardening Verification...");

  // 1. Setup Environment
  await fs.writeFile(TEST_FILE, "# Chapter 1\nLyra sighed.", "utf-8");

  // Create a dummy memory file
  const dummyMemory = {
    characterBible: [
      {
        name: "Lyra",
        archetype: "The Weaver",
        voice: "Melodic and hesitant",
        motivation: "To mend the veil",
        traits: [],
        status: "Alive",
      },
    ],
    worldLexicon: {
      terms: { Veil: "The barrier between worlds" },
      laws: ["Magic needs blood"],
      geography: [],
    },
  };

  // Ensure .marie directory exists
  try {
    await fs.mkdir(".marie");
  } catch (e) {
    // Ignore if directory already exists
  }
  await fs.writeFile(MEMORY_FILE, JSON.stringify(dummyMemory), "utf-8");

  // 2. Mock Services
  const mockContext = { extensionPath: process.cwd() } as any;
  const mockJoyService = { addAchievement: async () => {} } as any;
  const service = new NarrativeAutomationService(mockContext, mockJoyService);

  let callCount = 0;
  const capturedPrompts: string[] = [];

  // Mock Provider
  const mockProvider = {
    createMessage: async (params: any) => {
      callCount++;
      const prompt = params.messages[0].content;
      capturedPrompts.push(prompt);

      console.log(`🤖 AI Call #${callCount}`);

      return {
        content: `AI Response ${callCount}`,
        role: "assistant",
      };
    },
  };
  service.registerProviderFactory(() => mockProvider as any);

  try {
    // 3. Test Context Injection
    console.log("👉 Testing Context Injection...");
    await service.performHardening(
      TEST_FILE,
      HardeningPhase.CORE_EXPANSION,
      "Deepen traits",
      false,
    );

    const expansionPrompt = capturedPrompts[0];
    if (
      expansionPrompt.includes("The Weaver") &&
      expansionMagicCheck(expansionPrompt)
    ) {
      console.log(
        "✅ Context Injection Verified: Found 'The Weaver' and 'Magic needs blood'.",
      );
    } else {
      throw new Error(
        "Context Injection Failed! Prompt: " +
          expansionPrompt.substring(0, 100) +
          "...",
      );
    }

    // 4. Test Recursive Loop
    console.log("👉 Testing Recursive Loop (Attack -> Defense -> Audit)...");
    capturedPrompts.length = 0; // Clear history
    callCount = 0;

    await service.performHardening(
      TEST_FILE,
      HardeningPhase.HOSTILE_ATTACK,
      "Brutalize",
      true,
    );

    if (callCount === 3) {
      console.log(
        "✅ Recursion Verified: 3 AI calls triggered (Attack, Defense, Audit).",
      );
    } else {
      console.error(`❌ Recursion Failed: Expected 3 calls, got ${callCount}`);
    }
  } catch (e) {
    console.error("❌ Test Failed:", e);
  } finally {
    // Cleanup
    try {
      await fs.unlink(TEST_FILE);
      await fs.unlink(MEMORY_FILE);
      await fs.unlink("deep_test.expanded.md");
      await fs.unlink("deep_test.critique.md");
      await fs.unlink("deep_test.critique.hardened.md");
      await fs.unlink("deep_test.critique.hardened.audit.md");
    } catch (e) {
      // Ignore cleanup errors
    }
  }
}

function expansionMagicCheck(prompt: string): boolean {
  return prompt.includes("Magic needs blood");
}

verifyDeepHardening();
