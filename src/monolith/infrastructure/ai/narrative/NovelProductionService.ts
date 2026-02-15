import * as fs from "node:fs/promises";
import * as path from "path";
import { CritiqueService } from "./CritiqueService.js";

// ─── Pass Phases ───────────────────────────────────────────────
// Each chapter progresses through ordered passes.
// Each pass targets a specific zone. Previous passes become Semi-Canon.

export type PassPhase = "SKELETON" | "FLESH" | "NERVE" | "SOUL" | "CANON";

export const PASS_ORDER: PassPhase[] = [
  "SKELETON",
  "FLESH",
  "NERVE",
  "SOUL",
  "CANON",
];

export const PASS_ZONE_MAP: Record<Exclude<PassPhase, "CANON">, string> = {
  SKELETON: "PLUMBING",
  FLESH: "CORE_ARGUMENT",
  NERVE: "SUPPORT",
  SOUL: "NARRATIVE",
};

export const PASS_PERSONA: Record<PassPhase, string> = {
  SKELETON:
    "MODE: SKELETON. You are the Architect. Build the bones — interfaces, types, wiring, config. No implementation logic. Structure only.",
  FLESH:
    "MODE: FLESH. You are the Craftsman. Fill the skeleton with domain logic and implementations. Do NOT touch interfaces or types from SKELETON.",
  NERVE:
    "MODE: NERVE. You are the Surgeon. Stress-test every joint — write tests, add error handling, validate edge cases. Do NOT rewrite logic from FLESH.",
  SOUL: "MODE: SOUL. You are the Poet. Give it meaning — documentation, comments, narrative voice, README. Do NOT alter code from previous passes.",
  CANON:
    "MODE: HISTORIAN. The Volume is Canon. All passes complete. Protect the archive. Read-only.",
};

// ─── Continuity Ledger ─────────────────────────────────────────
// Records what each pass accomplished, providing context for the next pass.

export interface LedgerEntry {
  pass: PassPhase;
  summary: string;
  filesLocked: string[]; // Files that became Semi-Canon after this pass
  timestamp: string;
}

// ─── Novel Structures ──────────────────────────────────────────

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
  currentPass: PassPhase;
  completedPasses: PassPhase[];
  continuityLedger: LedgerEntry[];
  files: string[];
}

// ─── Service ───────────────────────────────────────────────────

export class NovelProductionService {
  private static readonly NOVEL_FILE = ".marie/novel_structure.json";
  private structure: { volumes: NovelVolume[] } = { volumes: [] };
  private critiqueService: CritiqueService;

  constructor(private rootPath: string) {
    this.critiqueService = new CritiqueService();
  }

  public async initialize() {
    try {
      const data = await fs.readFile(
        path.join(this.rootPath, NovelProductionService.NOVEL_FILE),
        "utf-8",
      );
      this.structure = JSON.parse(data);
    } catch (e) {
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
                currentPass: "CANON",
                completedPasses: [
                  "SKELETON",
                  "FLESH",
                  "NERVE",
                  "SOUL",
                  "CANON",
                ],
                continuityLedger: [
                  {
                    pass: "CANON",
                    summary:
                      "Foundational prompts and entry point established.",
                    filesLocked: ["src/prompts.ts", "src/index.ts"],
                    timestamp: new Date().toISOString(),
                  },
                ],
                files: ["src/prompts.ts", "src/index.ts"],
              },
            ],
          },
        ],
      };
      await this.save();
    }
  }

  public async save() {
    await fs.mkdir(path.join(this.rootPath, ".marie"), { recursive: true });
    await fs.writeFile(
      path.join(this.rootPath, NovelProductionService.NOVEL_FILE),
      JSON.stringify(this.structure, null, 2),
    );
  }

  // ─── Canon & Semi-Canon Checks ─────────────────────────────

  /** Is the file fully Canon (chapter completed all passes)? */
  public isCanon(filePath: string): boolean {
    const relative = path.relative(this.rootPath, filePath);
    for (const vol of this.structure.volumes) {
      for (const chap of vol.chapters) {
        if (chap.currentPass === "CANON" && chap.files.includes(relative)) {
          return true;
        }
      }
    }
    return false;
  }

  /** Is the file Semi-Canon (locked by a completed pass in the active chapter)? */
  public isPassLocked(filePath: string): {
    locked: boolean;
    lockedBy?: PassPhase;
  } {
    const relative = path.relative(this.rootPath, filePath);
    const activeChap = this.getActiveChapter();
    if (!activeChap) return { locked: false };

    for (const entry of activeChap.continuityLedger) {
      if (entry.filesLocked.includes(relative)) {
        return { locked: true, lockedBy: entry.pass };
      }
    }
    return { locked: false };
  }

  /** Get the zone that the current pass is allowed to modify. */
  public getCurrentPassZone(): string | null {
    const activeChap = this.getActiveChapter();
    if (!activeChap || activeChap.currentPass === "CANON") return null;
    return PASS_ZONE_MAP[activeChap.currentPass];
  }

  /** Get the current pass phase of the active chapter. */
  public getCurrentPass(): PassPhase | null {
    return this.getActiveChapter()?.currentPass || null;
  }

  // ─── Chapter Lifecycle ─────────────────────────────────────

  public async startNewChapter(
    title: string,
    description: string,
  ): Promise<NovelChapter> {
    const activeVol =
      this.structure.volumes.find((v) => v.status === "DRAFT") ||
      this.structure.volumes[0];
    const newChapter: NovelChapter = {
      id: activeVol.chapters.length + 1,
      title,
      description,
      currentPass: "SKELETON",
      completedPasses: [],
      continuityLedger: [],
      files: [],
    };
    activeVol.chapters.push(newChapter);
    await this.save();
    return newChapter;
  }

  /**
   * Attempt to advance to the next pass.
   * The CritiqueService gates each transition.
   */
  public async advancePass(
    summary: string,
  ): Promise<{ success: boolean; message: string }> {
    const activeChap = this.getActiveChapter();
    if (!activeChap) return { success: false, message: "No active chapter." };
    if (activeChap.currentPass === "CANON")
      return { success: false, message: "Chapter is already Canon." };

    // AUTO-DISCOVERY: Scan for files belonging to this chapter
    const vaultPath = path.join(this.rootPath, ".vault", "novel", "chapters");
    try {
      const files = await fs.readdir(vaultPath);
      const chapterFiles = files.filter(
        (f) =>
          f.startsWith(`Chapter_${activeChap.id}_`) && f.endsWith(".md"),
      );
      // Update activeChap.files with relative paths
      if (chapterFiles.length > 0) {
        activeChap.files = chapterFiles.map((f) =>
          path.join(".vault", "novel", "chapters", f),
        );
      }
    } catch (e) {
      // Ignore if directory doesn't exist yet
    }

    // Gate: CritiqueService reviews the current pass
    const review = await this.critiqueService.reviewPass(
      activeChap,
      activeChap.currentPass,
      this.rootPath,
    );
    if (!review.approved) {
      return {
        success: false,
        message: `Pass ${activeChap.currentPass} REJECTED. Score: ${review.score}. ${review.critique}`,
      };
    }

    // Lock current pass files
    const currentPassIndex = PASS_ORDER.indexOf(activeChap.currentPass);
    const ledgerEntry: LedgerEntry = {
      pass: activeChap.currentPass,
      summary,
      filesLocked: [...activeChap.files], // Lock all current files
      timestamp: new Date().toISOString(),
    };
    activeChap.continuityLedger.push(ledgerEntry);
    activeChap.completedPasses.push(activeChap.currentPass);

    // Advance to next pass
    const nextPass = PASS_ORDER[currentPassIndex + 1];
    activeChap.currentPass = nextPass;
    await this.save();

    return {
      success: true,
      message: `Pass ${ledgerEntry.pass} complete! Score: ${review.score}. Advanced to ${nextPass}. ${review.critique}`,
    };
  }

  // ─── Context for AI Prompts ────────────────────────────────

  public getActiveContext(): string {
    const activeVol = this.structure.volumes.find((v) => v.status === "DRAFT");
    if (!activeVol) return "No active volume.";

    const activeChap = this.getActiveChapter();
    const canonChaps = activeVol.chapters.filter(
      (c) => c.currentPass === "CANON",
    );

    if (!activeChap || activeChap.currentPass === "CANON") {
      return `
[NOVEL PRODUCTION STATUS]
Volume: ${activeVol.title}
All Chapters: CANON (Immutable)
[PERSONA INSTRUCTION]
${PASS_PERSONA.CANON}
            `.trim();
    }

    const persona = PASS_PERSONA[activeChap.currentPass];
    const allowedZone = PASS_ZONE_MAP[activeChap.currentPass];

    // Build continuity ledger summary for the AI
    const ledgerSummary =
      activeChap.continuityLedger.length > 0
        ? activeChap.continuityLedger
          .map(
            (e) =>
              `  [${e.pass}] ${e.summary} (Locked: ${e.filesLocked.join(", ")})`,
          )
          .join("\n")
        : "  (No previous passes)";

    return `
[NOVEL PRODUCTION STATUS]
Volume: ${activeVol.title}
Canon Chapters (IMMUTABLE): ${canonChaps.map((c) => c.title).join(", ") || "None"}
Active Chapter: "${activeChap.title}" — Pass ${PASS_ORDER.indexOf(activeChap.currentPass) + 1}/5
Current Pass: ${activeChap.currentPass}
Allowed Zone: ${allowedZone} (ONLY modify files in this zone)
Completed Passes: ${activeChap.completedPasses.join(" → ") || "None"}

[CONTINUITY LEDGER — What previous passes established]
${ledgerSummary}

[PERSONA INSTRUCTION]
${persona}

[PASS RULES]
- You may ONLY create/modify files that belong to the "${allowedZone}" zone.
- Files from completed passes are SEMI-CANON (read-only). Do not modify them.
- Build ON TOP of what previous passes established. Reference the Continuity Ledger.
- When this pass is complete, call advancePass() to lock your work and proceed.
        `.trim();
  }

  // ─── Helpers ───────────────────────────────────────────────

  private getActiveChapter(): NovelChapter | undefined {
    const activeVol = this.structure.volumes.find((v) => v.status === "DRAFT");
    if (!activeVol) return undefined;
    // Find the first non-Canon chapter (the active one)
    return activeVol.chapters.find((c) => c.currentPass !== "CANON");
  }
}
