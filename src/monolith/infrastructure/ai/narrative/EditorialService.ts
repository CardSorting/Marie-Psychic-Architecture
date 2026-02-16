import { EditorialPersonas } from "./EditorialPersonas.js";

export type EditorialRole = keyof typeof EditorialPersonas;

export interface CritiqueResult {
    role: EditorialRole;
    score: number; // 1-10
    feedback: string;
    requiredEdits: string[];
    blocking: boolean; // If true, low score = immediate rejection
}

export interface EditorialDecision {
    outcome: "APPROVE" | "REVISE" | "REJECT";
    averageScore: number;
    critiques: CritiqueResult[];
    consolidatedFeedback: string;
    strategy: "PROSE_FIX" | "STRUCTURAL_REWRITE" | "LORE_SYNC" | "APPROVE";
}

export class EditorialService {

    /**
     * Generates the prompt for a specific editor persona.
     */
    public getPrompt(role: EditorialRole, prose: string, context: string): string {
        const persona = EditorialPersonas[role];
        return `Role: ${persona.role}\nFocus: ${persona.focus}\n\nCONTEXT:\n${context.substring(0, 2000)}...\n\nPROSE TO REVIEW:\n${prose.substring(0, 10000)}\n\nINSTRUCTIONS:\n${persona.prompt}\n\nTASK: Critique the prose based on your criteria. Be strict. 7/10 is "Good". 9/10 is "Masterpiece".\n\nOutput JSON ONLY:\n{ "score": number (1-10), "feedback": "string (concise)", "requiredEdits": ["string"], "blocking": boolean (true if the issue renders the story unreadable/broken) }`;
    }

    /**
     * Conducts a "Board Meeting" where all relevant editors review the prose.
     * Returns a synthesized decision.
     */
    public makeDecision(critiques: CritiqueResult[]): EditorialDecision {
        if (critiques.length === 0) {
            return {
                outcome: "REVISE",
                averageScore: 0,
                critiques: [],
                consolidatedFeedback: "No critiques provided.",
                strategy: "PROSE_FIX" // Default to prose fix if no critiques/data
            };
        }

        const totalScore = critiques.reduce((sum, c) => sum + c.score, 0);
        const averageScore = totalScore / critiques.length;

        // Veto Logic: CHIEF_EDITOR and LOGICIAN checks
        const fatalFlaws = critiques.filter(c => c.score < 5 && c.blocking);

        let outcome: "APPROVE" | "REVISE" | "REJECT" = "APPROVE";
        if (fatalFlaws.length > 0) {
            outcome = "REJECT";
        } else if (averageScore < 7) {
            outcome = "REVISE";
        }

        // Synthesize feedback
        const consolidatedFeedback = critiques
            .map(c => `[${c.role} - ${c.score}/10]: ${c.feedback}`)
            .join("\n\n");

        const strategy = this.recommendStrategy(critiques, outcome);

        return {
            outcome,
            averageScore,
            critiques,
            consolidatedFeedback,
            strategy
        };
    }

    private recommendStrategy(critiques: CritiqueResult[], outcome: string): "PROSE_FIX" | "STRUCTURAL_REWRITE" | "LORE_SYNC" | "APPROVE" {
        if (outcome === "APPROVE") return "APPROVE";

        const blockingCritiques = critiques.filter(c => c.blocking || c.score < 5);

        // Prioritize Structural issues
        const structuralIssues = blockingCritiques.some(c => c.role === "CHIEF_EDITOR" || c.role === "DIRECTOR" || c.role === "THE_FIXER");
        if (structuralIssues) return "STRUCTURAL_REWRITE";

        // Prioritize Logic/Lore issues
        const logicIssues = blockingCritiques.some(c => c.role === "LOGICIAN" || c.role === "CONTINUITY");
        if (logicIssues) return "LORE_SYNC"; // Or Structural, but LORE_SYNC implies we might need more context? actually usually implies structural fix needed or just text fix.
        // Let's map Logic to Structural for now as it usually requires changing *what* happens, not just *how*.
        if (blockingCritiques.some(c => c.role === "LOGICIAN")) return "STRUCTURAL_REWRITE";

        return "PROSE_FIX";
    }

    public generateRevisionDirectives(decision: EditorialDecision, originalProse: string): string {
        if (decision.outcome === "APPROVE") return "";

        const directives = decision.critiques
            .filter(c => c.score < 8) // Only fix things that aren't great
            .map(c => `FROM ${c.role}: ${c.feedback} (Fix: ${c.requiredEdits.join(", ")})`)
            .join("\n\n");

        return `Role: Senior Editor (Fixer)\n\nTASK: Rewrite the provided prose to address the following strictly mandatory editorial directives.\n\nDIRECTIVES:\n${directives}\n\nORIGINAL PROSE:\n${originalProse}\n\nOUTPUT: The rewritten prose only.`;
    }

    public parseCritique(role: EditorialRole, rawOutput: string): CritiqueResult {
        try {
            const jsonMatch = rawOutput.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                return {
                    role,
                    score: parsed.score || 5,
                    feedback: parsed.feedback || "No feedback parsed.",
                    requiredEdits: parsed.requiredEdits || [],
                    blocking: parsed.blocking || false
                };
            }
        } catch (e) {
            // Fallback
        }
        return {
            role,
            score: 5,
            feedback: "Failed to parse critique.",
            requiredEdits: [],
            blocking: false
        };
    }
}
