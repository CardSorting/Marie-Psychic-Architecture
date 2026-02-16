
export interface OpenLoop {
    id: string; // e.g. "loop_cracked_sword"
    description: string;
    status: "OPEN" | "RESOLVED" | "DROPPED";
    createdChapterId: number;
    resolvedChapterId?: number;
    notes?: string;
}

export class LoopManager {
    public static generateArchivistPrompt(prose: string, currentLoops: OpenLoop[]): string {
        const loopText = currentLoops.map(l => `- [${l.id}] ${l.description}`).join("\n");
        return `Role: Narrative Archivist
Task: Analyze the prose for plot continuity.

OPEN PLOT LOOPS:
${loopText || "(None)"}

PROSE:
${prose.substring(0, 10000)}...

INSTRUCTIONS:
1. Did any OPEN loops get RESOLVED?
2. Did any NEW significant plot loops open? (Chekhov's Guns, Mysteries, Promises)

OUTPUT JSON ONLY:
{
  "resolvedLoops": [ "loop_id_1" ],
  "newLoops": [ { "id": "loop_new_1", "description": "Hero finds a key." } ]
}`;
    }
}
