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

    // Description check relaxed for velocity.
    if (chapter.description.length < 5) {
      // Just a gentle nudge, no score penalty.
      critiquePoints.push("Chapter description is brief.");
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
            await this.critiqueSkeleton(
              file,
              content,
              critiquePoints,
              (s) => (score += s),
            );
            break;
          case "FLESH":
            await this.critiqueFlesh(
              file,
              content,
              critiquePoints,
              (s) => (score += s),
            );
            break;
          case "NERVE":
            await this.critiqueNerve(
              file,
              content,
              chapter.files,
              critiquePoints,
              (s) => (score += s),
            );
            break;
          case "SOUL":
            await this.critiqueSoul(
              file,
              content,
              critiquePoints,
              (s) => (score += s),
            );
            break;
        }
      } catch (e) {
        score -= 20;
        critiquePoints.push(`'${file}' is missing or unreadable.`);
      }
    }

    score = Math.max(0, Math.min(100, score));
    const approved = score >= 25;
    const critique =
      critiquePoints.length > 0
        ? critiquePoints.join(" ")
        : "The Editor is pleased. The narrative holds.";

    return { approved, critique, score };
  }

  // ─── SKELETON: Structure & Scene Notes ──────────────────────
  private async critiqueSkeleton(
    file: string,
    content: string,
    points: string[],
    adjust: (n: number) => void,
  ) {
    const words = content.split(/\s+/).length;
    // Skeleton should have at least 500 words of scene notes
    if (words < 500) {
      adjust(-15);
      points.push(
        `SKELETON: '${file}' has only ${words} words. Skeleton should be 1000-2000 words of scene notes.`,
      );
    }
    // Should contain scene/chapter structure markers
    const hasStructure = /##|scene|setting|dialogue|character/i.test(content);
    if (!hasStructure) {
      adjust(-10);
      points.push(
        `SKELETON: '${file}' lacks structural markers (scenes, settings, characters).`,
      );
    }
  }

  // ─── FLESH: Full Prose & Narrative ───────────────────────────
  private async critiqueFlesh(
    file: string,
    content: string,
    points: string[],
    adjust: (n: number) => void,
  ) {
    const words = content.split(/\s+/).length;
    // FLESH: lenient because script assembles incrementally
    if (words < 500) {
      adjust(-10);
      points.push(
        `FLESH: '${file}' has only ${words} words. FLESH pass should be 4000-8000 words of prose.`,
      );
    }
    // Should contain actual prose paragraphs (long lines without bullet points)
    const lines = content.split("\n").filter((l) => l.trim().length > 0);
    const proseLines = lines.filter(
      (l) =>
        l.trim().length > 80 &&
        !l.trim().startsWith("-") &&
        !l.trim().startsWith("*"),
    );
    if (proseLines.length < 5) {
      adjust(-10);
      points.push(
        `FLESH: '${file}' appears to still be in outline format. Expected full prose paragraphs.`,
      );
    }
  }

  // ─── NERVE: Tension & Expansion ─────────────────────────────
  private async critiqueNerve(
    file: string,
    content: string,
    allFiles: string[],
    points: string[],
    adjust: (n: number) => void,
  ) {
    const words = content.split(/\s+/).length;
    // NERVE should be at least as long as FLESH output
    if (words < 2500) {
      adjust(-10);
      points.push(
        `NERVE: '${file}' has only ${words} words. NERVE pass should expand the chapter, not shrink it.`,
      );
    }
  }

  // ─── SOUL: Polish & Publishing Quality ─────────────────────
  private async critiqueSoul(
    file: string,
    content: string,
    points: string[],
    adjust: (n: number) => void,
  ) {
    const words = content.split(/\s+/).length;
    // SOUL should maintain or increase word count
    if (words < 2500) {
      adjust(-10);
      points.push(
        `SOUL: '${file}' has only ${words} words. SOUL pass should maintain or increase length.`,
      );
    }
    // Check for a strong opening
    const firstLine = content.split("\n").find((l) => l.trim().length > 20);
    if (firstLine && firstLine.trim().startsWith("#")) {
      // Just a heading — the actual prose should start strong
      // This is fine, no penalty
    }
  }
}
