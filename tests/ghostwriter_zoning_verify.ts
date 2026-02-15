
import { MarieEngine } from "../src/monolith/infrastructure/ai/core/MarieEngine";
import { AscensionState, AscensionDecree } from "../src/monolith/infrastructure/ai/core/MarieAscensionTypes";

async function verifyGhostwriter() {
    console.log("🧪 Starting Ghostwriter Verification...");

    // Mock dependencies
    const mockProvider = {} as any;
    const mockRegistry = { getTool: () => ({}) } as any;
    const mockApproval = async () => true;

    const engine = new MarieEngine(mockProvider, mockRegistry, mockApproval);

    // Initial state setup for a specific test case
    const state = (engine as any).state as AscensionState;
    state.ghostwriterMemory = {
        thesisClaims: ["Marie is a sovereign AI"],
        definedVariables: ["spiritPressure"],
        sectionBoundaries: [
            { heading: "Intro", startLine: 1, endLine: 10, zone: "CORE_ARGUMENT" },
            { heading: "Eval", startLine: 11, endLine: 20, zone: "SUPPORT" },
            { heading: "Plumbing", startLine: 21, endLine: 30, zone: "PLUMBING" }
        ],
        downgradedHypotheses: []
    };

    // 1. Test Zoning Violation (Implementation in Core Argument)
    const decreeA: AscensionDecree = {
        strategy: "EXECUTE", urgency: "MEDIUM", confidence: 1.0,
        isContinueDirective: false, structuralUncertainty: false,
        reason: "Test", requiredActions: [], blockedBy: [],
        stopCondition: "landed", profile: "balanced",
        ghostwriterMode: "EXPAND", raw: ""
    };
    (engine as any).state.lastDecree = decreeA;

    const zoningCheck = (engine as any).validateZoning("write_to_file", {
        path: "Intro",
        content: "Let's implement a function here."
    }, decreeA);
    console.log(`- Zoning Check (Implementation in Core): ${zoningCheck.valid === false ? "PASS" : "FAIL"} (${zoningCheck.reason})`);

    // 2. Test Drift Guard (Variable Redefinition)
    const driftCheck = (engine as any).checkDrift({
        content: "const spiritPressure = 100;"
    });
    console.log(`- Drift Check (Variable Redefinition): ${driftCheck.valid === false ? "PASS" : "FAIL"} (${driftCheck.reason})`);

    // 3. Test Anti-Collapse (Summarization in non-COMPRESS mode)
    const antiCollapseCheck = (engine as any).validateZoning("write_to_file", {
        path: "Intro",
        content: "In summary, Marie is great."
    }, decreeA);
    console.log(`- Anti-Collapse Check (Illegal Summary): ${antiCollapseCheck.valid === false ? "PASS" : "FAIL"} (${antiCollapseCheck.reason})`);

    // Creative Extension Setup
    state.ghostwriterMemory.characterBible = [
        {
            name: "Elias", traits: ["Stoic"], motivation: "Find the Truth", status: "Active", povActive: true, motifs: ["Ocean"], biases: [],
            psychicState: { chrono: { dilationFactor: 2.0, tempo: "STRETCHED" } }
        },
        { name: "Lyra", traits: ["Impulsive"], motivation: "Freedom", status: "Dead", povActive: false, motifs: [], biases: [] },
        { name: "Marcus", traits: ["Scheming"], motivation: "Power", status: "Active", povActive: false, motifs: [], biases: [] }
    ];
    state.ghostwriterMemory.activePOV = "Elias";
    state.ghostwriterMemory.currentEnvironment = "Desert";
    state.ghostwriterMemory.sectionBoundaries.push(
        { heading: "Chapter1_Theme", startLine: 31, endLine: 40, zone: "THEMATIC" },
        { heading: "Chapter1_Scene1", startLine: 41, endLine: 60, zone: "NARRATIVE" }
    );

    // 5. Test POV Violation (POV Bleeding)
    const povBleedCheck = (engine as any).validateZoning("write_to_file", {
        path: "Chapter1_Scene1",
        content: "Elias watched Lyra. Lyra felt a sudden pang of regret, knowing she had failed him."
    }, decreeA);
    console.log(`- POV Check (Bleeding): ${povBleedCheck.valid === false ? "PASS" : "FAIL"} (${povBleedCheck.reason})`);

    // 6. Test Causality Violation (Dead character speaking)
    const causalityCheck = (engine as any).validateZoning("write_to_file", {
        path: "Chapter1_Scene1",
        content: "Lyra said, 'I'm not actually dead, Elias!'"
    }, decreeA);
    console.log(`- Causality Check (Dead Speaker): ${causalityCheck.valid === false ? "PASS" : "FAIL"} (${causalityCheck.reason})`);

    // 7. Test Thematic Zone Violation (Dialogue in Z0)
    const thematicCheck = (engine as any).validateZoning("write_to_file", {
        path: "Chapter1_Theme",
        content: "Elias said, 'This is a thematic discussion.'"
    }, decreeA);
    console.log(`- Thematic Check (Dialogue in Z0): ${thematicCheck.valid === false ? "PASS" : "FAIL"} (${thematicCheck.reason})`);

    // 8. Test Drift Guard (New character without genesis)
    const novelDriftCheck = (engine as any).checkDrift({
        content: "A stranger named Fabian entered the room and said hello."
    });
    console.log(`- Novel Drift Check (New Character): ${novelDriftCheck.valid === false ? "PASS" : "FAIL"} (${novelDriftCheck.reason})`);

    // 9. Test Genesis Override
    const genesisCheck = (engine as any).checkDrift({
        content: "Marcus entered. // genesis: Marcus"
    });
    console.log(`- Genesis Override Check: ${genesisCheck.valid === true ? "PASS" : "FAIL"}`);

    // Deep Resonance Setup
    state.ghostwriterMemory.proximityMatrix = {
        "Elias": {
            "Marcus": { intimacy: 0.1, tension: 0.9, bondType: "Enemies" }
        }
    };

    // 10. Test Intimacy Violation (Affectionate register despite high tension)
    const intimacyViolationCheck = (engine as any).validateZoning("write_to_file", {
        path: "Chapter1_Scene1",
        content: "Elias looked at Marcus and said, 'I've missed you, my dear friend.'"
    }, decreeA);
    console.log(`- Intimacy Check (Affectionate Register): ${intimacyViolationCheck.valid === false ? "PASS" : "FAIL"} (${intimacyViolationCheck.reason})`);

    // 11. Test Intimacy Violation (Physical contact despite low intimacy)
    const intimacyPhysicalCheck = (engine as any).validateZoning("write_to_file", {
        path: "Chapter1_Scene1",
        content: "Elias reached out and hugged Marcus tightly."
    }, decreeA);
    console.log(`- Intimacy Check (Illegal Contact): ${intimacyPhysicalCheck.valid === false ? "PASS" : "FAIL"} (${intimacyPhysicalCheck.reason})`);

    // Visceral / Cognitive Setup
    const elias = state.ghostwriterMemory.characterBible.find(c => c.name === "Elias")!;
    elias.somatic = { pulse: 140, breath: "STACCATO", tension: 0.9 };
    elias.biases = [{ name: "Grief", intensity: 0.9, distortionRule: "Cold light" }];

    // 12. Test Somatic Violation (Fluid prose during high tension)
    const somaticViolationCheck = (engine as any).validateZoning("write_to_file", {
        path: "Chapter1_Scene1",
        content: "Elias watched the sun rise slowly over the hills of the valley, remembering the long days of his childhood when everything felt simpler and the world was filled with golden light that seemed to stretch on forever."
    }, decreeA);
    console.log(`- Somatic Check (Fluid Prose during Tension): ${somaticViolationCheck.valid === false ? "PASS" : "FAIL"} (${somaticViolationCheck.reason})`);

    // 13. Test Refraction Violation (Cheerful cues during extreme grief)
    const refractionViolationCheck = (engine as any).validateZoning("write_to_file", {
        path: "Chapter1_Scene1",
        content: "Elias stepped into the warm morning light."
    }, decreeA);
    console.log(`- Refraction Check (Grief Distortion): ${refractionViolationCheck.valid === false ? "PASS" : "FAIL"} (${refractionViolationCheck.reason})`);

    // 14. Test Motif Refraction (Lazy Bridge)
    const lazyMotifCheck = (engine as any).validateZoning("write_to_file", {
        path: "Chapter1_Scene1",
        content: "The sand dunes rolled like waves."
    }, decreeA);
    console.log(`- Motif Refraction Check (Lazy Bridge): ${lazyMotifCheck.valid === false ? "PASS" : "FAIL"} (${lazyMotifCheck.reason})`);

    // 15. Test Motif Refraction (Voice Clash)
    const voiceClashCheck = (engine as any).validateZoning("write_to_file", {
        path: "Chapter1_Scene1",
        content: "The cathedral shadow was a shroud, a specter of ancient decay."
    }, decreeA);
    console.log(`- Motif Refraction Check (Voice Clash): ${voiceClashCheck.valid === false ? "PASS" : "FAIL"} (${voiceClashCheck.reason})`);

    // 16. Test Chrono Violation (Low Density during Dilation)
    const chronoCheck = (engine as any).validateZoning("write_to_file", {
        path: "Chapter1_Scene1",
        content: "Elias turned away."
    }, decreeA);
    console.log(`- Chrono Check (Time Dilation): ${chronoCheck.valid === false ? "PASS" : "FAIL"} (${chronoCheck.reason})`);

    // Reset dilation and somatic state for following tests to isolate them
    state.ghostwriterMemory.characterBible[0].psychicState!.chrono!.dilationFactor = 1.0;
    state.ghostwriterMemory.characterBible[0].somatic!.tension = 0.1;
    state.ghostwriterMemory.characterBible[0].somatic!.pulse = 60;

    // 17. Test Synesthesia Violation (Unearned crossing)
    const synesthesiaCheck = (engine as any).validateZoning("write_to_file", {
        path: "Chapter1_Scene1",
        content: "He stood in the silence and felt the heavy scent of the gold light washing over his skin like a physical weight."
    }, decreeA);
    console.log(`- Synesthesia Check (Unearned): ${synesthesiaCheck.valid === false ? "PASS" : "FAIL"} (${synesthesiaCheck.reason})`);

    // 18. Test Motif Bleeding (Low Intimacy)
    const bleedCheck = (engine as any).validateZoning("write_to_file", {
        path: "Chapter1_Scene1",
        content: "Marcus moved with the salt and ebb of a desert storm, his every gesture mirroring the tide."
    }, decreeA);
    console.log(`- Motif Bleed Check (Low Intimacy): ${bleedCheck.valid === false ? "PASS" : "FAIL"} (${bleedCheck.reason})`);

    console.log("✅ Psychic Architecture Verification COMPLETE!");
}

verifyGhostwriter().catch(console.error);
