import * as fs from "node:fs/promises";
import * as path from "path";
import { NovelChapter } from "./NovelProductionService.js";

export interface CritiqueResult {
    approved: boolean;
    critique: string;
    score: number; // 0-100
}

/**
 * The "Ruthless Editor" service.
 * Reviews chapters for narrative and structural integrity before they are allowed to become Canon.
 */
export class CritiqueService {

    /**
     * Reviews a chapter and its files.
     */
    public async reviewChapter(chapter: NovelChapter, rootPath: string): Promise<CritiqueResult> {
        let score = 100;
        const critiquePoints: string[] = [];

        // 1. Structural Check: Does the chapter have files?
        if (!chapter.files || chapter.files.length === 0) {
            return {
                approved: false,
                critique: "The chapter is empty. A void cannot be Canon.",
                score: 0
            };
        }

        // 2. File Integrity Check
        for (const file of chapter.files) {
            try {
                const content = await fs.readFile(path.join(rootPath, file), "utf-8");

                // A. Placeholder Detection (The "TODO" Demon)
                if (content.includes("TODO") || content.includes("FIXME")) {
                    score -= 10;
                    critiquePoints.push(`File '${file}' contains unresolved TODO markers.`);
                }

                // B. Voice Consistency (Simple Keyword Check)
                // If it's a domain file, it should be "Joyful"
                if (file.includes("domain") || file.includes("core")) {
                    if (content.length < 100) {
                        score -= 5;
                        critiquePoints.push(`File '${file}' is too brief for a Core Argument.`);
                    }
                }

            } catch (e) {
                score -= 20;
                critiquePoints.push(`File '${file}' is missing or unreadable.`);
            }
        }

        // 3. Narrative Flow Check (Mock)
        // In a real system, this would use an LLM call to analyze the prose/code logic.
        // For now, we simulate the "Editor's Intuition".
        if (chapter.description.length < 10) {
            score -= 10;
            critiquePoints.push("Chapter description is too vague. The Canon requires intent.");
        }

        const approved = score >= 80;
        const critique = critiquePoints.length > 0
            ? critiquePoints.join(" ")
            : "The Editor is pleased. The narrative holds.";

        return {
            approved,
            critique,
            score
        };
    }
}
