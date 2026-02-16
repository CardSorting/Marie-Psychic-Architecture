import { MarieCLI } from "../../../adapters/CliMarieAdapter.js";
import { Log } from "./ProductionLogger.js";
import { NovelChapter } from "./NovelProductionService.js";
import { captureWithRetry, captureAgentOutput, readSafe, countWords, sleep, extractKeywords } from "./ProductionUtils.js";
import { WorldService } from "./WorldService.js";

export class DraftingService {
    constructor(
        private marie: MarieCLI,
        private log: Log,
        private worldService: WorldService
    ) { }

    public async generateConcept(ch: NovelChapter, feedback?: any): Promise<string | null> {
        process.stdout.write(`   💡 Generating Concept for ${ch.mode}: "${ch.title}"...\n`);

        const prompt = `Architect Mode. Create a High-Level Concept for a ${ch.mode}.
TITLE: ${ch.title}
DESCRIPTION: ${ch.description}
${feedback ? `FEEDBACK FROM PREVIOUS ATTEMPT: ${JSON.stringify(feedback)}` : ""}

OUTPUT FORMAT (Markdown):
# CONCEPT: ${ch.title}
## Core Thesis / Premise
(1-2 sentences)
## Target Audience
(Who is this for?)
## Key Themes / Arguments
- Point 1
- Point 2
## Tone & Style
(e.g. "Urgent", "Whimsical", "Academic")
`;
        return await captureWithRetry(this.marie, prompt, this.log, ch.id, "CONCEPT", "Concept Doc", 100);
    }

    public async generateOutline(ch: NovelChapter, concept: string): Promise<string | null> {
        process.stdout.write(`   📝 Generating Outline...\n`);

        let requirements = `
- For ARTICLES/OP-EDS: Use H1, H2, H3 structure with bullet points for content.
- For STORIES: Use Scene list with emotional beats.
- Be specific. Include "Target Word Count" per section.`;

        if (ch.mode === "MUSIC_STUDIO") {
            requirements = `
- For MUSIC_STUDIO: Use a Song Structure (Intro, Verse 1, Pre-Chorus, Chorus, Verse 2, Pre-Chorus, Chorus, Bridge, Final Chorus, Outro).
- For each section, define the 'Vibe', 'Lyrical Direction', and 'Sonic Focus'.
- Identify where the 'Earworm Motif' and 'Hooks' from the concept/hook isolation should be placed.
- Be extremely specific about the emotional arc of the lyrics.`;
        }

        const prompt = `Planner Mode. Create a detailed OUTLINE based on this concept.
${concept}

REQUIREMENTS:
${requirements}
`;
        return await captureWithRetry(this.marie, prompt, this.log, ch.id, "OUTLINE", "Outline", 200);
    }

    public async generateDraft(ch: NovelChapter, outline: string): Promise<string | null> {
        process.stdout.write(`   ✍️  Drafting Content (Quantum Mode)...\n`);

        // 🔮 Context Injection
        const keywords = extractKeywords(outline);
        const worldContext = this.worldService.getWorldContext(keywords);
        if (worldContext.includes("RELEVANT ENTITIES")) {
            process.stdout.write(`   🧠 Injected World Context (${keywords.slice(0, 3).join(", ")}...)\n`);
        }

        // Define Variants based on Mode
        let variants = [
            { type: "STANDARD", focus: "Balanced execution" },
            { type: "CREATIVE", focus: "High flair, metaphor, and style" },
            { type: "DIRECT", focus: "Concise, punchy, low-fluff" }
        ];

        if (ch.mode === "SHORT_STORY") {
            variants = [
                { type: "A: ACTION/PACING", focus: "Fast moving, high stakes" },
                { type: "B: ATMOSPHERE", focus: "Slow burn, sensory details" },
                { type: "C: CHARACTER", focus: "Internal monologue, deep POV" }
            ];
        } else if (ch.mode === "OP_ED") {
            variants = [
                { type: "A: PROVOCATIVE", focus: "Controversial, strong stance" },
                { type: "B: ANALYTICAL", focus: "Data-driven, logical flow" },
                { type: "C: EMPATHETIC", focus: "Personal connection, emotional appeal" }
            ];
        } else if (ch.mode === "MUSIC_STUDIO") {
            variants = [
                { type: "A: CHART-TOPPER (POP)", focus: "Maximum catchiness, repetitive hooks, high energy" },
                { type: "B: BALLAD/EMOTIONAL", focus: "Deep emotional resonance, powerful vocals, slower build" },
                { type: "C: PERFORMANCE/RAP", focus: "Complex rhythm, sharp delivery, high attitude and 'swag'" }
            ];
        }

        // Generate Variants (Parallel)
        process.stdout.write(`   ⚛️  Generating ${variants.length} content variants...\n`);

        const promises = variants.map(async (v) => {
            const role = ch.mode === "MUSIC_STUDIO" ? "Music Songwriter Mode" : "Writer Mode";
            const task = ch.mode === "MUSIC_STUDIO" ? "Write the FULL SONG LYRICS" : "Write the FULL BODY text";
            
            const p = `${role}. ${task} for this ${ch.mode}.
OUTLINE:
${outline}

WORLD CONTEXT:
${worldContext}

STYLE VARIANT: ${v.type}
FOCUS: ${v.focus}
${ch.mode === "MUSIC_STUDIO" ? "Ensure all song sections (Intro, Verse, Chorus, etc.) are clearly labeled. Include performance cues [in brackets] if necessary." : "Keep it under 2000 words. Start with the Title."}`;
            return captureWithRetry(this.marie, p, this.log, ch.id, "DRAFT", `Variant ${v.type}`, 400);
        });

        const results = await Promise.all(promises);

        // Collapse (Selection)
        const validResults = results.filter(r => r.length > 100);
        if (validResults.length === 0) return null;

        const selectionPrompt = `Editor-in-Chief Mode. Select the best draft.
${validResults.map((r, i) => `VARIANT ${i}:\n${r.slice(0, 500)}...\n`).join("\n")}
TASK: Return the Index (0-${validResults.length - 1}) of the best version. Just the number.`;

        const choice = await captureAgentOutput(this.marie, selectionPrompt);
        const winnerIndex = parseInt(choice.match(/\d/)?.[0] || "0");

        process.stdout.write(`   🏆 Selected Variant ${winnerIndex}: ${variants[winnerIndex]?.type || "Default"}\n`);

        return validResults[winnerIndex] || null;
    }

    public async generateMusicStudioBrief(ch: NovelChapter): Promise<string | null> {
        process.stdout.write(`   💡 Generating Billboard-Tier Brief for Track: "${ch.title}"...\n`);

        const prompt = `STUDIO BRIEF MODE (Billboard Dominance).
TITLE: ${ch.title}
DESCRIPTION: ${ch.description}

TASK: 
1. Identify the 'Hit Factor' (The Hook) with surgical precision. It must be instantly viral.
2. Define the 'Sonic Texture' - must sound expensive, massive, and iconic.
3. Define the 'Billboard Trajectory' — exactly why this will hit #1.
4. Define 1 core 'Earworm Motif' that is scientifically designed to stick in the brain.
5. Goal: ABSOLUTE Billboard 100 Dominance. No fillers.

OUTPUT FORMAT (Markdown):
# STUDIO BRIEF: ${ch.title}
## The Hook
## Sonic Texture
## Billboard Trajectory
## Earworm Motif
## Production Goal: Chart Dominance Strategy
`;
        return await captureWithRetry(this.marie, prompt, this.log, ch.id, "BRIEF", "Studio Brief", 150);
    }

    public async generateHookSnippets(ch: NovelChapter): Promise<string | null> {
        process.stdout.write(`   🪝  Isolating Billboard Hooks & Motifs...\n`);

        const prompt = `HOOK ISOLATION MODE.
CHAPTER DETAILS:
Title: ${ch.title}
Brief: ${ch.description}

TASK:
1. Extract the 3 most potential 'Hooks' from the concept.
2. Identify a 'Core Motif' (a recurring word, sound, or image) that will become the Earworm.
3. Rank them based on 'Viral Potential' and 'Chart Trajectory'.

OUTPUT: A ranked list of hooks and their earworm motifs.
`;
        return await captureWithRetry(this.marie, prompt, this.log, ch.id, "HOOK_ISOLATION", "Hook Selection", 150);
    }

    public async generateViralPromos(ch: NovelChapter, finalTrack: string): Promise<string | null> {
        process.stdout.write(`   📢 Generating Empire Marketing Assets (Viral Promo)...\n`);

        const prompt = `VIRAL PROMO GENERATION.
FINAL TRACK:
${finalTrack}

TASK:
1. Generate 5 Social Media Captions (Short, Viral-focused).
2. Create a 'Platform Script' for a 15-second teaser.
3. Identify 10 high-impact Hashtags for Global Saturation.
4. Write a 'Press Release' snippet for the global release.

OUTPUT: The complete Empire Marketing Bundle for the track.
`;
        return await captureWithRetry(this.marie, prompt, this.log, ch.id, "VIRAL_PROMO", "Marketing Bundle Assets", 400);
    }
}




