import { WorldService } from "./WorldService.js";

export interface BlueprintScene {
    id: number;
    title: string;
    pacingType: "HOOK" | "INCITING_INCIDENT" | "RISING_ACTION" | "CLIMAX" | "RESOLUTION" | "CLIFFHANGER";
    characters: string[];
    purpose: string;
    setting: string;
}

export interface Blueprint {
    chapterId: number;
    title: string;
    theme: string;
    pacingCurve: string[];
    scenes: BlueprintScene[];
    validationErrors: string[];
}

export class BlueprintService {
    constructor(private worldService: WorldService) { }

    public generateBlueprintPrompt(chapterId: number, title: string, context: string, previousChapterSummary: string): string {
        return `Role: Narrative Architect\n\nTASK: Create a structural BLUEPRINT for Chapter ${chapterId}: "${title}".\n\nCONTEXT:\n${context}\n\nPREVIOUS CHAPTER SUMMARY:\n${previousChapterSummary}\n\nREQUIREMENTS:\n1. 5-8 Scenes.\n2. Must follow a pacing curve (Start slow/hook -> Build Tension -> Climax -> Resolution/Cliffhanger).\n3. Each scene must have a clear purpose.\n\nOUTPUT JSON ONLY:\n{
    "chapterId": ${chapterId},
    "title": "${title}",
    "theme": "Core theme of this chapter",
    "pacingCurve": ["HOOK", "RISING_ACTION", ...],
    "scenes": [
        {
            "id": 1,
            "title": "Scene Title",
            "pacingType": "HOOK",
            "characters": ["CharA", "CharB"],
            "purpose": "What changes by the end of this scene?",
            "setting": "Location"
        }
    ]
}`;
    }

    public validateBlueprint(blueprint: Blueprint): boolean {
        const errors: string[] = [];

        if (blueprint.scenes.length < 3) errors.push("Too few scenes (min 3).");
        if (blueprint.scenes.length > 10) errors.push("Too many scenes (max 10).");

        const types = blueprint.scenes.map(s => s.pacingType);
        if (!types.includes("CLIMAX")) errors.push("Chapter missing a CLIMAX scene.");
        // if (!types.includes("HOOK") && !types.includes("INCITING_INCIDENT")) errors.push("Chapter starts without a Hook or Incident.");

        blueprint.validationErrors = errors;
        return errors.length === 0;
    }

    public parseBlueprint(raw: string): Blueprint | null {
        try {
            const jsonMatch = raw.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }
        } catch (e) {
            return null;
        }
        return null;
    }
}
