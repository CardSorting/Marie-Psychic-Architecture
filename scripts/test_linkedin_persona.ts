import { EditorialPersonas } from "../src/monolith/infrastructure/ai/narrative/EditorialPersonas.js";

async function verifyPersona() {
    console.log("--- Verifying EditorialPersonas Object ---");
    const persona = (EditorialPersonas as any).LINKEDIN_INFLUENCER;

    if (!persona) {
        console.log("❌ FAILURE: LINKEDIN_INFLUENCER persona NOT found in EditorialPersonas.");
        process.exit(1);
    }

    console.log(`Role: ${persona.role}`);
    console.log(`Focus: ${persona.focus}`);

    const hasGravityWells = persona.prompt.includes("Gravity Wells");
    const hasInevitability = persona.prompt.includes("inevitability");
    const hasNoStartup = persona.prompt.includes("NEVER mention your own startup");

    if (hasGravityWells && hasInevitability && hasNoStartup) {
        console.log("\n✅ SUCCESS: Persona prompt contains all core requirements.");
    } else {
        console.log("\n❌ FAILURE: Persona prompt is missing requirements.");
        console.log(`hasGravityWells: ${hasGravityWells}, hasInevitability: ${hasInevitability}, hasNoStartup: ${hasNoStartup}`);
    }
}

verifyPersona().catch(console.error);
