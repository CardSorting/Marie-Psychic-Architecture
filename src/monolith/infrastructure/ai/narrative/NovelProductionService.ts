import * as fs from "node:fs/promises";
import * as path from "path";
import { NarrativeFileSystem } from "./NarrativeFileSystem.js";
import { IProductionStrategy } from "./strategies/IProductionStrategy.js";
import { EssayProductionStrategy } from "./strategies/EssayStrategy.js";
import { StructuredProductionStrategy } from "./strategies/StructuredStrategy.js";
import { WorldService } from "./WorldService.js";

// ─── Pass Phases ───────────────────────────────────────────────
// Kept for backward compatibility and type referencing in strategies
export type PassPhase = "BLUEPRINT" | "SKELETON" | "FLESH" | "NERVE" | "SOUL" | "CANON" | string;

export const PASS_ORDER: PassPhase[] = [
  "BLUEPRINT",
  "SKELETON",
  "FLESH",
  "NERVE",
  "SOUL",
  "CANON",
];

export const PASS_ZONE_MAP: Record<string, string> = {
  BLUEPRINT: "STRUCTURE",
  SKELETON: "OUTLINE",
  FLESH: "PROSE",
  NERVE: "TENSION",
  SOUL: "THEME",
};

export const PASS_PERSONA: Record<PassPhase, string> = {
  BLUEPRINT:
    "MODE: ARCHITECT. You are the Narrative Strategist. Create a rigorous structural blueprint. Define scene pacing, character motivations, and thematic arcs BEFORE writing any prose.",
  SKELETON:
    "MODE: SKELETON. You are the Architect of Narrative. Build a structured chapter outline using **Scene N: Title** format. Each scene should include: Setting, Characters, Dialogue beats, Sensory details, and Thematic hooks. This is a blueprint — do NOT write full prose yet.",
  FLESH:
    "MODE: FLESH. You are the Novelist. You will be given ONE scene's notes at a time. Write 400-600 words of vivid prose for that single scene. Include sensory detail, dialogue with action beats, internal monologue, and world-building woven into the narrative. The production script handles assembly.",
  NERVE:
    "MODE: NERVE. You are the Editor of Tension. Read existing prose and EXPAND it — add subtext, foreshadowing, sensory layering, internal conflict, and environmental storytelling. Do NOT delete existing content. Add 200-400 new words per section.",
  SOUL: "MODE: SOUL. You are the Literary Alchemist. Polish to publishable quality: strengthen the opening hook, refine metaphors, ensure consistent voice, smooth transitions, and craft a compelling close. Do NOT shorten the chapter.",
  CANON:
    "MODE: ARCHIVIST. The chapter is Canon. All passes complete. This text is immutable. Read-only.",
};

// ─── Continuity Ledger ─────────────────────────────────────────


// ─── Continuity Ledger ─────────────────────────────────────────

export interface LedgerEntry {
  pass: PassPhase;
  summary: string;
  filesLocked: string[];
  timestamp: string;
}

export type ContinuityEntry = LedgerEntry;

// ─── Novel Structures ──────────────────────────────────────────

export interface NovelVolume {
  id: number;
  title: string;
  chapters: NovelChapter[];
  status: "DRAFT" | "PUBLISHED";
  mode?: string; // "ESSAY" | "STRUCTURED"
}

export interface NovelChapter {
  id: number;
  title: string;
  description: string;
  currentPass: PassPhase;
  completedPasses: PassPhase[];
  continuityLedger: ContinuityEntry[];
  files: string[];
  mode?: string;
  wordCount?: number;
  lastModified?: string;
}

// ─── Service ───────────────────────────────────────────────────

export class NovelProductionService {
  private structure: { volumes: NovelVolume[] } = { volumes: [] };
  private strategies: Map<string, IProductionStrategy> = new Map();
  private worldService: WorldService;
  private fileSystem: NarrativeFileSystem;

  public get fs() { return this.fileSystem; }

  constructor(private rootPath: string) {
    this.worldService = new WorldService(rootPath);
    this.fileSystem = new NarrativeFileSystem(rootPath);
    // Register strategies
    this.registerStrategy(new EssayProductionStrategy());
    this.registerStrategy(new StructuredProductionStrategy(this.worldService));
  }

  public registerStrategy(strategy: IProductionStrategy) {
    this.strategies.set(strategy.mode, strategy);
  }

  private getStrategy(mode: string = "ESSAY"): IProductionStrategy {
    return this.strategies.get(mode) || this.strategies.get("ESSAY")!;
  }

  public async initialize() {
    await this.worldService.initialize();
    await this.fileSystem.initialize();

    // Load structure from filesystem
    const loaded = await this.fileSystem.loadStructure();

    if (loaded.volumes.length > 0) {
      this.structure = loaded;
    } else {
      // Create default if empty
      this.structure = {
        volumes: [
          {
            id: 1,
            title: "Volume 1: The Awakening",
            status: "DRAFT",
            mode: "ESSAY",
            chapters: [
              {
                id: 1,
                title: "Genesis",
                description: "Initial scaffolding and prompt engineering.",
                currentPass: "CANON",
                completedPasses: [
                  "BLUEPRINT",
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
                mode: "ESSAY",
              },
            ],
          },
        ],
      };
      await this.save();
    }
  }

  public async save() {
    // DEPRECATED: This full-scan save is inefficient.
    // Kept only for legacy callers or emergency state dumping.
    for (const vol of this.structure.volumes) {
      await this.fileSystem.saveVolume(vol);
      for (const chap of vol.chapters) {
        await this.fileSystem.saveChapter(vol.id, vol.title, chap);
      }
    }
  }

  // ─── Canon & Semi-Canon Checks ─────────────────────────────

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

  public isPassLocked(filePath: string): {
    locked: boolean;
    lockedBy?: PassPhase;
  } {
    const relative = path.relative(this.rootPath, filePath);
    const activeChap = this.getActiveChapter();
    if (!activeChap) return { locked: false };

    if (activeChap.files.includes(relative)) {
      return { locked: false };
    }

    for (const entry of activeChap.continuityLedger) {
      if (entry.filesLocked.includes(relative)) {
        return { locked: true, lockedBy: entry.pass };
      }
    }
    return { locked: false };
  }

  // Deprecated? Mostly used by Essay Mode
  public getCurrentPassZone(): string | null {
    const activeChap = this.getActiveChapter();
    if (!activeChap || activeChap.currentPass === "CANON") return null;
    return PASS_ZONE_MAP[activeChap.currentPass] || null;
  }

  public getCurrentPass(): PassPhase | null {
    return this.getActiveChapter()?.currentPass || null;
  }

  // ─── Chapter Lifecycle ─────────────────────────────────────

  public async startNewChapter(
    title: string,
    description: string,
    modeOverride?: string
  ): Promise<NovelChapter> {
    await this.worldService.initialize();
    const activeVol =
      this.structure.volumes.find((v) => v.status === "DRAFT") ||
      this.structure.volumes[0];

    const mode = modeOverride || activeVol.mode || "ESSAY";
    const strategy = this.getStrategy(mode);

    const newChapter = strategy.initializeChapter(
      activeVol.chapters.length + 1,
      title,
      description
    );
    // Explicitly set the mode on the chapter 
    newChapter.mode = mode;

    activeVol.chapters.push(newChapter);

    // ATOMIC SAVE: Only save the affected chapter and volume metadata
    await this.fileSystem.saveChapter(activeVol.id, activeVol.title, newChapter);
    await this.fileSystem.saveVolume(activeVol); // Updates volume metadata (if we tracked chap count there)

    return newChapter;
  }

  public async advancePass(
    chapter: NovelChapter,
    summary: string,
    force: boolean = false,
    overrideNextPass?: PassPhase,
  ): Promise<{ success: boolean; message: string }> {
    const activeChap = chapter;
    if (!activeChap) return { success: false, message: "No active chapter." };

    // Default to ESSAY if mode is undefined (migration fallback)
    const mode = activeChap.mode || "ESSAY";
    const strategy = this.getStrategy(mode);

    const result = await strategy.advancePass(activeChap, this.rootPath, summary, force, overrideNextPass);
    if (result.success) {
      // Find the volume for this chapter to save accurately
      const vol = this.structure.volumes.find(v => v.chapters.includes(activeChap));
      if (vol) {
        // ATOMIC SAVE
        await this.fileSystem.saveChapter(vol.id, vol.title, activeChap);
      } else {
        // Fallback if we can't find the parent volume (shouldn't happen)
        console.warn("Could not find parent volume for chapter save. Triggering global save.");
        await this.save();
      }
    }
    return result;
  }

  // ─── Context for AI Prompts ────────────────────────────────

  public getActiveContext(): string {
    const activeVol = this.structure.volumes.find((v) => v.status === "DRAFT");
    if (!activeVol) return "No active volume.";

    const activeChap = this.getActiveChapter();
    const canonChaps = activeVol.chapters.filter(
      (c) => c.currentPass === "CANON",
    );

    const volumeContext = `
Volume: ${activeVol.title}
Canon Chapters (IMMUTABLE): ${canonChaps.map((c) => c.title).join(", ") || "None"}
    `.trim();

    if (!activeChap) {
      return `
[NOVEL PRODUCTION STATUS]
Volume: ${activeVol.title}
All Chapters: CANON (Immutable)
        `.trim();
    }

    const mode = activeChap.mode || "ESSAY";
    const strategy = this.getStrategy(mode);

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

    return strategy.getContext(activeChap, volumeContext, ledgerSummary);
  }

  // ─── Helpers ───────────────────────────────────────────────

  public getActiveChapter(): NovelChapter | undefined {
    // Ensuring structure is loaded
    if (!this.structure || !this.structure.volumes) return undefined;
    const activeVol = this.structure.volumes.find((v) => v.status === "DRAFT" || v.status === "PUBLISHED"); // Support finding chapter even if published? No, draft.
    // Actually existing logic was fine:
    // const activeVol = this.structure.volumes.find((v) => v.status === "DRAFT");

    // Let's stick to existing logic but public
    const vol = this.structure.volumes.find((v) => v.status === "DRAFT");
    if (!vol) return undefined;
    return vol.chapters.find((c) => c.currentPass !== "CANON");
  }

  // ─── UTILS ───
  public async regressToBlueprint(chId: number) {
    if (!this.structure) await this.initialize();
    // Find chapter across all volumes
    for (const vol of this.structure.volumes) {
      const ch = vol.chapters.find((c: any) => c.id === chId);
      if (ch) {
        ch.currentPass = "BLUEPRINT";
        await this.fileSystem.saveChapter(vol.id, vol.title, ch);
        return;
      }
    }
  }
}
