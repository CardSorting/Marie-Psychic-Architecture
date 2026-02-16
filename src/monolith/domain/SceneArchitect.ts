
export interface BeatSheet {
    sceneId: number;
    title: string;
    beats: SceneBeatUnit[];
}

export interface SceneBeatUnit {
    type: "ACTION" | "DIALOGUE" | "INTERNAL" | "DESCRIPTION";
    content: string;
    outcome: string;
}

export class SceneArchitect {

    public static generateBeatSheet(sceneSummary: string, context: string): string {
        return `Role: Expert Scene Architect (Screenwriter)
Task: Break down the following scene summary into a strict 5-10 beat sheet.
Focus: Pacing, "Show Don't Tell", and Character Agency.

SCENE SUMMARY:
${sceneSummary}

CONTEXT:
${context}

OUTPUT FORMAT (JSON ONLY):
{
  "beats": [
    { "type": "ACTION", "content": "Hero kicks open the door.", "outcome": "Establishes threat." },
    { "type": "DIALOGUE", "content": "Villain: 'You're late.'", "outcome": "Tension rises." }
  ]
}`;
    }

    public static parseBeatSheet(raw: string): BeatSheet | null {
        try {
            const match = raw.match(/\{[\s\S]*\}/);
            if (match) {
                return JSON.parse(match[0]);
            }
        } catch (e) {
            return null;
        }
        return null;
    }
}
