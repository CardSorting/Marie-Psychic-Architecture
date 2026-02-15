import * as fs from "node:fs/promises";
import * as path from "path";
import { NovelChapter, PassPhase } from "./NovelProductionService.js";

export interface CritiqueResult {
    approved: boolean;
    critique: string;
    score: number; // 0-100
}

/**
 * The "Ruthless Editor" — Zone-Aware Pass Reviewer.
 * Each pass is reviewed with criteria specific to its target zone.
 */
export class CritiqueService {

    /**
     * Reviews a specific pass of a chapter.
     * Each pass has different quality criteria based on its zone focus.
     */
    public async reviewPass(
        chapter: NovelChapter,
        pass: PassPhase,
        rootPath: string,
    ): Promise<CritiqueResult> {
        if (pass === "CANON") {
            return { approved: true, critique: "Canon is eternal.", score: 100 };
        }

        let score = 100;
        const critiquePoints: string[] = [];

        // ─── Universal Checks ──────────────────────────────────
        if (!chapter.files || chapter.files.length === 0) {
            return {
                approved: false,
                critique: "The chapter has no files. A pass without artifacts is void.",
                score: 0,
            };
        }

        if (chapter.description.length < 10) {
            score -= 10;
            critiquePoints.push("Chapter description is too vague. The Canon requires intent.");
        }

        // ─── Per-File Checks ───────────────────────────────────
        for (const file of chapter.files) {
            try {
                const content = await fs.readFile(path.join(rootPath, file), "utf-8");

                // Universal: TODO/FIXME detection
                const todoCount = (content.match(/TODO|FIXME|HACK/g) || []).length;
                if (todoCount > 0) {
                    score -= Math.min(20, todoCount * 5);
                    critiquePoints.push(`'${file}': ${todoCount} unresolved markers.`);
                }

                // ─── Zone-Specific Checks ──────────────────────
                switch (pass) {
                    case "SKELETON":
                        await this.critiqueSkeleton(file, content, critiquePoints, s => score += s);
                        break;
                    case "FLESH":
                        await this.critiqueFlesh(file, content, critiquePoints, s => score += s);
                        break;
                    case "NERVE":
                        await this.critiqueNerve(file, content, chapter.files, critiquePoints, s => score += s);
                        break;
                    case "SOUL":
                        await this.critiqueSoul(file, content, critiquePoints, s => score += s);
                        break;
                }
            } catch (e) {
                score -= 20;
                critiquePoints.push(`'${file}' is missing or unreadable.`);
            }
        }

        score = Math.max(0, Math.min(100, score));
        const approved = score >= 70;
        const critique = critiquePoints.length > 0
            ? critiquePoints.join(" ")
            : "The Editor is pleased. The narrative holds.";

        return { approved, critique, score };
    }

    // ─── SKELETON: Structure & Interfaces ──────────────────────
    private async critiqueSkeleton(
        file: string, content: string, points: string[], adjust: (n: number) => void,
    ) {
        // Skeleton files should define interfaces, types, or config
        const hasInterface = /interface\s+\w+|type\s+\w+\s*=|export\s+(?:interface|type)/i.test(content);
        const hasImplementation = /class\s+\w+\s*(?:extends|implements)|new\s+\w+\(/i.test(content);

        if (!hasInterface && file.includes("port") || file.includes("interface") || file.includes("types")) {
            adjust(-10);
            points.push(`SKELETON: '${file}' should define interfaces/types but none found.`);
        }
        if (hasImplementation && !file.includes("test")) {
            adjust(-5);
            points.push(`SKELETON: '${file}' contains implementation logic. SKELETON is for structure only.`);
        }
    }

    // ─── FLESH: Domain Logic & Implementation ──────────────────
    private async critiqueFlesh(
        file: string, content: string, points: string[], adjust: (n: number) => void,
    ) {
        const lines = content.split("\n").filter(l => l.trim().length > 0);

        // Flesh files should have substantial implementation
        if (lines.length < 20 && (file.includes("service") || file.includes("impl"))) {
            adjust(-10);
            points.push(`FLESH: '${file}' is too thin (${lines.length} lines). Domain logic requires depth.`);
        }

        // Check for empty function bodies
        const emptyFunctions = (content.match(/\{[\s\n]*\}/g) || []).length;
        if (emptyFunctions > 2) {
            adjust(-5 * emptyFunctions);
            points.push(`FLESH: '${file}' has ${emptyFunctions} empty function bodies. Fill the skeleton.`);
        }
    }

    // ─── NERVE: Tests & Validation ─────────────────────────────
    private async critiqueNerve(
        file: string, content: string, allFiles: string[], points: string[], adjust: (n: number) => void,
    ) {
        // Check if test files exist for implementation files
        const hasTestPattern = /describe\s*\(|it\s*\(|test\s*\(|expect\s*\(/i.test(content);

        if (file.includes("test") || file.includes("spec")) {
            if (!hasTestPattern) {
                adjust(-15);
                points.push(`NERVE: '${file}' is a test file but contains no test assertions.`);
            }
        }

        // Check for error handling
        const hasTryCatch = /try\s*\{|\.catch\s*\(/i.test(content);
        if (file.includes("service") && !hasTryCatch && !file.includes("test")) {
            adjust(-5);
            points.push(`NERVE: '${file}' has no error handling. Every nerve needs protection.`);
        }
    }

    // ─── SOUL: Documentation & Narrative ───────────────────────
    private async critiqueSoul(
        file: string, content: string, points: string[], adjust: (n: number) => void,
    ) {
        const lines = content.split("\n");
        const commentLines = lines.filter(l => /^\s*(\/\/|\/\*|\*|#)/.test(l)).length;
        const commentRatio = commentLines / Math.max(lines.length, 1);

        // Soul pass should ensure adequate documentation
        if (commentRatio < 0.1 && lines.length > 50) {
            adjust(-10);
            points.push(`SOUL: '${file}' has only ${(commentRatio * 100).toFixed(0)}% comments. The code needs a voice.`);
        }

        // Check for JSDoc presence on exports
        const exports = (content.match(/export\s+(function|class|const|interface)/g) || []).length;
        const jsdocs = (content.match(/\/\*\*/g) || []).length;
        if (exports > 0 && jsdocs < exports * 0.5) {
            adjust(-5);
            points.push(`SOUL: '${file}' has ${exports} exports but only ${jsdocs} JSDoc blocks. Document the public API.`);
        }
    }
}
