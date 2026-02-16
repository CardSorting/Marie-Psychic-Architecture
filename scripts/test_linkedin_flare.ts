import { LinkedInProductionStrategy } from '../src/monolith/infrastructure/ai/narrative/strategies/LinkedInStrategy.js';
import { WorldService } from '../src/monolith/infrastructure/ai/narrative/WorldService.js';
import { EditorialPersonas } from '../src/monolith/infrastructure/ai/narrative/EditorialPersonas.js';

async function verifyFlare() {
    console.log("Verifying LinkedIn Persona Flare Integration...");

    const worldService = new WorldService(process.cwd());
    const strategy = new LinkedInProductionStrategy(worldService);

    const chapter = strategy.initializeChapter(1, "The Future of Agents", "A post about AI coordination.");

    // Check STRATEGY phase (Stage 1 & 2)
    const strategyContext = strategy.getContext(chapter, "Vol 1", "Ledger...");
    // console.log("--- STRATEGY CONTEXT ---");
    // console.log(strategyContext);

    if (strategyContext.includes("Prophecy Intake") && strategyContext.includes("Coordination Gravity")) {
        console.log("✅ STRATEGY phase aligned with Stage 1 & 2 flare.");
    } else {
        console.log("❌ STRATEGY phase missing flare elements.");
    }

    // Advance to OUTLINE (Stage 3)
    chapter.currentPass = "OUTLINE";
    const outlineContext = strategy.getContext(chapter, "Vol 1", "Ledger...");
    if (outlineContext.includes("Hook Optimizer") && outlineContext.includes("Destabilize -> Simplify -> Escalate -> Bless")) {
        console.log("✅ OUTLINE phase aligned with Stage 3 flare.");
    } else {
        console.log("❌ OUTLINE phase missing flare elements.");
    }

    // Advance to DRAFT (Stage 4 & 5)
    chapter.currentPass = "DRAFT";
    const draftContext = strategy.getContext(chapter, "Vol 1", "Ledger...");
    if (draftContext.includes("Humanizer") && draftContext.includes("Humanizing Patch") && draftContext.includes("Call-to-Ascension")) {
        console.log("✅ DRAFT phase aligned with Stage 4 & 5 flare.");
    } else {
        console.log("❌ DRAFT phase missing flare elements.");
    }

    // Check Persona definition
    const persona = (EditorialPersonas as any).LINKEDIN_INFLUENCER;
    if (persona.prompt.includes("THE 5-STAGE FLARE") && persona.prompt.includes("Friction in the Event Horizon")) {
        console.log("✅ EditorialPersona definition strictly updated with flare.");
    } else {
        console.log("❌ EditorialPersona definition missing flare rules.");
    }
}

verifyFlare().catch(console.error);
