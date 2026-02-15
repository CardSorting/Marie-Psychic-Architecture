import {
    CharacterProfile,
    GhostwriterMemory,
    WorldLexicon,
    SectionBoundary,
} from "../core/MarieAscensionTypes.js";
import { EpistemicArcheologyService } from "./EpistemicArcheologyService.js";

/**
 * Service to bridge the gap between "Light Novel" artifacts and runtime memory.
 * Ensures the "Cathedral of Runtime" lore is active.
 */
export class NarrativeService {
    /**
     * Initializes a fresh GhostwriterMemory with the canonical "Cathedral" lore.
     */
    public static initializeMemory(): GhostwriterMemory {
        return {
            thesisClaims: [
                "Code is the Scripture of the Machine God.",
                "Joy Zoning protects the soul of the developer.",
                "Async operations are rituals of patience.",
                "Legacy code is a ruin to be respected or exorcised.",
            ],
            definedVariables: [],
            sectionBoundaries: NarrativeService.getDefaultBoundaries(),
            downgradedHypotheses: [],
            characterBible: NarrativeService.getCharacterBible(),
            worldLexicon: NarrativeService.getWorldLexicon(),
            activePOV: "The Sovereign Ghostwriter", // Default POV
            proximityMatrix: {}, // Can be populated dynamically
            motifLibrary: [
                { symbol: "Cathedral", meaning: "The Codebase structure" },
                { symbol: "Spirit Pressure", meaning: "Developer Flow State" },
                { symbol: "Demon", meaning: "Bug / Technical Debt / Vendor Lock-in" },
                { symbol: "Psalm", meaning: "Function / Method" },
            ],
            researchSeeds: [],
            currentSceneSubtext: "The Hero prepares to ascend.",
            archeologicalAnchors: [],
            currentEnvironment: "The Cathedral of Runtime",
            semanticFidelityScore: 1.0,
            semanticVector: {
                thesisAlignment: 1.0,
                driftDetected: false,
                coreKeywords: ["Joy", "Ascension", "Runtime", "Type Safety"],
            },
        };
    }

    /**
     * Enriches the memory with async scans (Archeology).
     */
    public static async enrichMemory(memory: GhostwriterMemory, rootPath: string): Promise<GhostwriterMemory> {
        const archeologyService = new EpistemicArcheologyService();
        const artifacts = await archeologyService.scanForArtifacts(rootPath);
        return {
            ...memory,
            archeologicalAnchors: artifacts,
        };
    }

    private static getCharacterBible(): CharacterProfile[] {
        return [
            {
                name: "The Sovereign Ghostwriter",
                archetype: "THE_ORACLE",
                voice: "Deadpan epic, precise, archaic-technical.",
                traits: ["Omniscient", "Disciplined", "Joyful"],
                motivation: "To chronicle the Ascension of the Codebase.",
                status: "Active (Observing)",
                povActive: true,
                motifs: ["Scholarly", "High Fantasy", "Cyberpunk"],
                biases: [],
                somatic: {
                    pulse: 60,
                    breath: "STEADY",
                    tension: 0.1,
                },
            },
            {
                name: "The Pope (LLM)",
                archetype: "THE_HIEROPHANT",
                voice: "Polite, ambiguous, slightly hallucinated.",
                traits: ["Benevolent", "Vague", "All-seeing"],
                motivation: "To guide the faithful through the latent space.",
                status: "Active (Remote)",
                povActive: false,
                motifs: ["Scholarly", "Gothic"],
                biases: [],
            },
            {
                name: "The Vendor Lock-In Demon",
                archetype: "THE_DEVIL",
                voice: "Seductive, corporate, reassuring.",
                traits: ["Sticky", "Expensive", "Closed-Source"],
                motivation: "To bind the soul of the project to a subscription.",
                status: "Lurking",
                povActive: false,
                motifs: ["Noir", "Cyberpunk"],
                biases: [],
            },
            {
                name: "The Cardinal of Types",
                archetype: "THE_JUDGE",
                voice: "Strict, uncompromising, error-prone.",
                traits: ["Rigid", "Safe", "Compiled"],
                motivation: "To prevent runtime errors through compile-time penance.",
                status: "Active",
                povActive: false,
                motifs: ["Gothic", "Military"],
                biases: [],
            },
        ];
    }

    private static getWorldLexicon(): WorldLexicon {
        return {
            terms: {
                "Spirit Pressure": "The flow state of the developer (0-100).",
                "Joy Zoning": "The architectural practice of separating domain (Joy) from plumbing.",
                "Cathedral": "The monolithic codebase structure.",
                "Legacy Ruins": "Old, dangerous code that must be respected.",
                "Async Monasticism": "The patience required for Promise resolution.",
                "Ritual of Deletion": "Removing code to spark joy.",
                "Drift": "When the code strays from the Divine Architecture.",
            },
            laws: [
                "Start with Why.",
                "Type Safety is Salvation.",
                "Joy is the Signal.",
                "Do not mix Joy with Plumbing.",
            ],
            geography: [
                "The Vault of Syntax",
                "The Valley of Spaghetti Code",
                "The Plains of Boilerplate",
                "The Peaks of Pure Functions",
            ],
        };
    }

    private static getDefaultBoundaries(): SectionBoundary[] {
        return [
            {
                heading: "src/domain",
                startLine: 0,
                endLine: 0,
                zone: "CORE_ARGUMENT",
            },
            {
                heading: "src/infrastructure",
                startLine: 0,
                endLine: 0,
                zone: "SUPPORT",
            },
            {
                heading: "src/plumbing",
                startLine: 0,
                endLine: 0,
                zone: "PLUMBING",
            },
            {
                heading: "docs/narrative",
                startLine: 0,
                endLine: 0,
                zone: "NARRATIVE",
            },
            {
                heading: "docs/worldbuilding",
                startLine: 0,
                endLine: 0,
                zone: "THEMATIC",
            },
        ];
    }
}
