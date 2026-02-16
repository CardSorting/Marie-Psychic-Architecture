import { VolumeArc, ChapterArc } from "./NarrativePlanner.js";
import { OpenLoop } from "./OpenLoop.js";

export class Showrunner {
    public static generateReplanPrompt(
        currentChapterTitle: string,
        currentSummary: string,
        nextChapter: ChapterArc,
        volumeTheme: string,
        openLoops: OpenLoop[]
    ): string {
        const loopText = openLoops.filter(l => l.status === "OPEN").map(l => `- ${l.description}`).join("\n");

        return `Role: Narrative Showrunner
Task: Update the plan for the NEXT chapter based on what just happened.

CONTEXT:
Volume Theme: ${volumeTheme}
Just Finished: "${currentChapterTitle}"
Summary of Finished Chapter: "${currentSummary}"

OPEN PLOT LOOPS:
${loopText || "(None)"}

ORIGINAL PLAN FOR NEXT CHAPTER (ID ${nextChapter.chapterId}):
Title: ${nextChapter.title}
Purpose: ${nextChapter.purpose}
Old Summary: ${nextChapter.summary}

INSTRUCTIONS:
1. Rewrite the summary for the NEXT chapter to bridge the gap between what just happened and the volume's goal.
2. Ensure at least one Open Loop is advanced or referenced if possible.
3. Keep the "Purpose" (e.g., Rising Action) but pivot the content if needed.

OUTPUT JSON ONLY:
{
  "title": "New Title (if needed)",
  "summary": "Updated detailed summary of what should happen in this chapter..."
}`;
    }

    public static parseUpdate(raw: string): { title?: string, summary?: string } | null {
        try {
            const jsonMatch = raw.match(/\{[\s\S]*\}/);
            if (!jsonMatch) return null;
            return JSON.parse(jsonMatch[0]);
        } catch (e) {
            return null;
        }
    }
}
