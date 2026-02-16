import { EditorialPersonas } from "./EditorialPersonas.js";

export type EditorialRole = "DIRECTOR" | "CONTINUITY" | "MOE" | "PROSE";

export interface CritiqueResult {
    role: EditorialRole;
    score: number; // 1-10
    feedback: string;
    requiredEdits: string[];
}

export class EditorialBoard {

    // No dependencies on CLI adapter to avoid circular imports. 
    // This class just handles Prompt Engineering and Parsing.

    public static getPrompt(role: EditorialRole, prose: string, context: string): string {
        const persona = EditorialPersonas[role];
        return `Role: ${persona.role}\nFocus: ${persona.focus}\n\nCONTEXT:\n${context}\n\nPROSE TO REVIEW:\n${prose.substring(0, 5000)}...\n\nINSTRUCTIONS:\n${persona.prompt}\n\nTask: critiques the prose based on your criteria.\n\nOutput JSON ONLY:\n{ "score": number (1-10), "feedback": "string (concise)", "requiredEdits": ["string"] }`;
    }

    public static generateFixPrompt(critique: CritiqueResult, originalProse: string): string {
        return `Role: Senior Editor (Fixer)\n\nTASK: Rewrite the following prose to address the critique.\n\nCRITIQUE (${critique.role}):\n${critique.feedback}\n\nREQUIRED EDITS:\n- ${critique.requiredEdits.join("\n- ")}\n\nORIGINAL PROSE:\n${originalProse}\n\nOUTPUT: The rewritten prose only.`;
    }

    public static parseCritique(role: EditorialRole, rawOutput: string): CritiqueResult {
        try {
            const jsonMatch = rawOutput.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                return {
                    role,
                    score: parsed.score || 5,
                    feedback: parsed.feedback || "No feedback parsed.",
                    requiredEdits: parsed.requiredEdits || []
                };
            }
        } catch (e) {
            // Fallback
        }
        return {
            role,
            score: 5,
            feedback: "Failed to parse critique.",
            requiredEdits: []
        };
    }
}
