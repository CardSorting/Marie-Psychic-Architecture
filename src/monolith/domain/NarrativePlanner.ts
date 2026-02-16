
import { OpenLoop } from "./OpenLoop.js";

export interface VolumeArc {
    volumeId: number;
    title: string;
    theme: string;
    plannedChapters: ChapterArc[];
    majorEvents: string[]; // Key plot points (Inciting Incident, Midpoint, Climax)
    openLoops: OpenLoop[];
}

export interface ChapterArc {
    chapterId: number;
    title: string;
    summary: string;
    purpose: "SETUP" | "INCITING_INCIDENT" | "RISING_ACTION" | "MIDPOINT" | "FALLING_ACTION" | "CLIMAX" | "RESOLUTION";
    povCharacterId: string;
    beats: SceneBeat[];
}

export interface SceneBeat {
    id: number;
    description: string;
    requiredCharacters: string[];
    outcome: string; // What needs to change by the end?
}

export class NarrativePlanner {
    // Standard Light Novel Pacing (12 Chapters / 4 Acts)
    private static readonly TEMPLATE_12_CH = [
        { purpose: "SETUP", count: 1, title: "Introduction" },
        { purpose: "INCITING_INCIDENT", count: 1, title: "The Call" },
        { purpose: "RISING_ACTION", count: 3, title: "Trials & Allies" },
        { purpose: "MIDPOINT", count: 1, title: "The Twist" },
        { purpose: "RISING_ACTION", count: 3, title: "Escalation" },
        { purpose: "CLIMAX", count: 2, title: "The Final Battle" },
        { purpose: "RESOLUTION", count: 1, title: "Aftermath" }
    ];

    public static createVolumeTemplate(volId: number, title: string, theme: string): VolumeArc {
        let chId = 1;
        const chapters: ChapterArc[] = [];

        for (const section of this.TEMPLATE_12_CH) {
            for (let i = 0; i < section.count; i++) {
                chapters.push({
                    chapterId: chId++,
                    title: `${section.title} ${i > 0 ? i + 1 : ""}`.trim(),
                    summary: `Placeholder for ${section.purpose} arc.`,
                    purpose: section.purpose as any,
                    povCharacterId: "CHR_HERO", // Default
                    beats: []
                });
            }
        }

        return {
            volumeId: volId,
            title,
            theme,
            plannedChapters: chapters,
            majorEvents: [],
            openLoops: []
        };
    }
}
