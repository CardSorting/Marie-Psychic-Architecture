import * as fs from "node:fs/promises";
import * as path from "path";
import { GhostwriterMemory } from "../core/MarieAscensionTypes.js";

import { CritiqueService } from "./CritiqueService.js";

export interface NovelVolume {
    id: number;
    title: string;
    chapters: NovelChapter[];
    status: "DRAFT" | "PUBLISHED";
}

export interface NovelChapter {
    id: number;
    title: string;
    description: string;
    status: "PLANNED" | "DRAFTING" | "REFINING" | "CANON";
    files: string[]; // Files that belong to this chapter
}

/**
 * Service to manage the "Novel Production" lifecycle.
 * Prevents "Rewriting the Universe" by enforcing Canon status.
 */
export class NovelProductionService {
    private static readonly NOVEL_FILE = ".marie/novel_structure.json";
    private structure: { volumes: NovelVolume[] } = { volumes: [] };
    private critiqueService: CritiqueService;

    constructor(private rootPath: string) {
        this.critiqueService = new CritiqueService();
    }

    public async initialize() {
        try {
            const data = await fs.readFile(path.join(this.rootPath, NovelProductionService.NOVEL_FILE), "utf-8");
            this.structure = JSON.parse(data);
        } catch (e) {
            // Initialize default structure
            this.structure = {
                volumes: [
                    {
                        id: 1,
                        title: "Volume 1: The Awakening",
                        status: "DRAFT",
                        chapters: [
                            {
                                id: 1,
                                title: "Genesis",
                                description: "Initial scaffolding and prompt engineering.",
                                status: "CANON",
                                files: ["src/prompts.ts", "src/index.ts"],
                            }
                        ]
                    }
                ]
            };
            await this.save();
        }
    }

    public async save() {
        await fs.mkdir(path.join(this.rootPath, ".marie"), { recursive: true });
        await fs.writeFile(
            path.join(this.rootPath, NovelProductionService.NOVEL_FILE),
            JSON.stringify(this.structure, null, 2)
        );
    }

    /**
     * Checks if a file is part of the "Canon" (Immutable Universe).
     */
    public isCanon(filePath: string): boolean {
        const relative = path.relative(this.rootPath, filePath);
        for (const vol of this.structure.volumes) {
            for (const chap of vol.chapters) {
                if (chap.status === "CANON" && chap.files.includes(relative)) {
                    return true;
                }
            }
        }
        return false;
    }

    /**
     * Starts a new Chapter in the current Volume.
     */
    public async startNewChapter(title: string, description: string): Promise<NovelChapter> {
        const activeVol = this.structure.volumes.find(v => v.status === "DRAFT") || this.structure.volumes[0];
        const newChapter: NovelChapter = {
            id: activeVol.chapters.length + 1,
            title,
            description,
            status: "DRAFTING",
            files: []
        };
        activeVol.chapters.push(newChapter);
        await this.save();
        return newChapter;
    }

    /**
     * Attempts to mark the current active chapter as Canon.
     * Enforces the "Editor's Table" critique.
     */
    public async canonizeCurrentChapter(): Promise<{ success: boolean; message: string }> {
        const activeVol = this.structure.volumes.find(v => v.status === "DRAFT");
        if (!activeVol) return { success: false, message: "No active volume." };

        // Find latest non-canon chapter
        const activeChap = [...activeVol.chapters].reverse().find(c => c.status !== "CANON");
        if (!activeChap) return { success: false, message: "No active chapter to canonize." };

        // ARBITRATION: The Editor's Table
        const review = await this.critiqueService.reviewChapter(activeChap, this.rootPath);

        if (review.approved) {
            activeChap.status = "CANON";
            await this.save();
            return { success: true, message: `Canonization Approved! Score: ${review.score}. ${review.critique}` };
        } else {
            activeChap.status = "REFINING"; // Push back to refining
            await this.save();
            return { success: false, message: `Canonization REJECTED. Score: ${review.score}. Editor's Note: ${review.critique}` };
        }
    }

    public getActiveContext(): string {
        const activeVol = this.structure.volumes.find(v => v.status === "DRAFT");
        if (!activeVol) return "No active volume.";

        const activeChap = activeVol.chapters.find(c => c.status !== "CANON");
        const canonChaps = activeVol.chapters.filter(c => c.status === "CANON");

        let personaInstruction = "";
        if (activeChap) {
            switch (activeChap.status) {
                case "DRAFTING":
                    personaInstruction = "MODE: DRAFTING. Be wild, experimental. The Editor is sleeping. Generate Volume!";
                    break;
                case "REFINING":
                    personaInstruction = "MODE: REFINING. The Editor is watching. Be rigorous, precise, and critical.";
                    break;
                default:
                    personaInstruction = "MODE: PLANNING. Plot the trajectory.";
            }
        } else {
            personaInstruction = "MODE: HISTORIAN. The Volume is Canon. Protect the archives.";
        }

        return `
[NOVEL PRODUCTION STATUS]
Volume: ${activeVol.title}
Canon Chapters (READ-ONLY): ${canonChaps.map(c => c.title).join(", ")}
Active Chapter (WRITABLE): ${activeChap ? `${activeChap.title} (${activeChap.status})` : "None"}
Context: ${activeChap ? activeChap.description : "None"}
[PERSONA INSTRUCTION]
${personaInstruction}
        `.trim();
    }
}
