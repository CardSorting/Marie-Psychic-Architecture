import path from "path";
import * as fs from "node:fs/promises";
import { AIProvider } from "../providers/AIProvider.js";
import { ToolRegistry } from "../../tools/ToolRegistry.js";
import { MarieProgressTracker } from "./MarieProgressTracker.js";
import { MarieSession, MarieSessionPromptProfile } from "./MarieSession.js";
import { MarieEventDispatcher } from "./MarieEventDispatcher.js";
import { MarieToolProcessor } from "./MarieToolProcessor.js";
import { MarieAscendant } from "../agents/MarieAscendant.js";
import {
  AscensionState,
  AscensionDecree,
  GhostwriterMemory,
} from "./MarieAscensionTypes.js";
import { MarieLockManager } from "./MarieLockManager.js";
import { MarieToolMender } from "./MarieToolMender.js";
import { MariePulseService } from "./MariePulseService.js";
import { MarieStabilityMonitor } from "./MarieStabilityMonitor.js";
import { ReasoningBudget } from "./ReasoningBudget.js";
import { ConfigService } from "../../config/ConfigService.js";
import { FileSystemPort } from "./FileSystemPort.js";
import { GhostPort } from "./GhostPort.js";

export function getPromptProfileForDepth(
  depth: number,
): MarieSessionPromptProfile {
  return depth > 0 ? "continuation" : "full";
}

/**
 * Entry point for the AI Engine. YOLO Supremacy Edition.
 */
export class MarieEngine {
  private static readonly CONTENT_BUFFER_MAX_BYTES = 1024 * 1024;
  private static readonly MEMORY_FILE = ".marie/ghostwriter_memory.json";
  private ascendant: MarieAscendant;
  private state: AscensionState;
  private lockManager: MarieLockManager;
  private toolMender: MarieToolMender;
  private pulseService: MariePulseService | undefined;
  private reasoningBudget: ReasoningBudget;
  private toolCallCounter: number = 0;
  private contentBuffer: string = "";
  private lastContentEmit: number = 0;
  private static activeTurn: Promise<void> | null = null;
  private disposed: boolean = false;

  constructor(
    private provider: AIProvider,
    private toolRegistry: ToolRegistry,
    private approvalRequester: (name: string, input: any) => Promise<boolean>,
    private providerFactory?: (type: string) => AIProvider,
    private fs?: FileSystemPort,
    private ghostPort?: GhostPort,
  ) {
    this.ascendant = new MarieAscendant(this.provider);
    this.state = this.initializeState();
    this.loadGhostwriterMemory().catch((e) =>
      console.error("Failed to load narrative memory:", e),
    );
    this.lockManager = new MarieLockManager();
    this.toolMender = new MarieToolMender(this.toolRegistry);
    this.reasoningBudget = new ReasoningBudget();
  }

  private initializeState(): AscensionState {
    return {
      errorHotspots: {},
      totalErrorCount: 0,
      spiritPressure: 50,
      recentFiles: [],
      toolHistory: [],
      techniqueExecutions: [],
      victoryStreak: 0,
      shakyResponseDensity: 0,
      writtenFiles: [],
      actionDiffs: {},
      wiringAlerts: [],
      mood: "STABLE",
      isSpiritBurstActive: false,
      isAwakened: false,
      karmaBond: undefined,
      panicCoolDown: 0,
      environment: this.fs?.type === "vscode" ? "vscode" : "cli",
      lastFailedFile: undefined,
      ghostwriterMemory: {
        thesisClaims: [],
        definedVariables: [],
        sectionBoundaries: [],
        downgradedHypotheses: [],
        characterBible: [],
        worldLexicon: {
          terms: {},
          laws: [],
          geography: [],
        },
        activePOV: undefined,
      },
    };
  }

  private async loadGhostwriterMemory() {
    try {
      const data = await fs.readFile(MarieEngine.MEMORY_FILE, "utf-8");
      const memory = JSON.parse(data);
      if (this.state) {
        this.state.ghostwriterMemory = {
          ...this.state.ghostwriterMemory,
          ...memory,
        };
      }
    } catch (e) {
      // Memory file might not exist yet
    }
  }

  private async saveGhostwriterMemory() {
    if (!this.state.ghostwriterMemory) return;
    try {
      await fs.mkdir(path.dirname(MarieEngine.MEMORY_FILE), {
        recursive: true,
      });
      await fs.writeFile(
        MarieEngine.MEMORY_FILE,
        JSON.stringify(this.state.ghostwriterMemory, null, 2),
        "utf-8",
      );
    } catch (e) {
      console.error("Failed to save narrative memory:", e);
    }
  }

  private validatePOV(
    content: string,
    memory: GhostwriterMemory,
  ): { valid: boolean; reason?: string } {
    if (!memory.activePOV) return { valid: true };
    const povProfile = memory.characterBible?.find(
      (c) => c.name === memory.activePOV,
    );
    if (!povProfile) return { valid: true };

    // Simple POV Bleed Detection: Check if thoughts/feelings of other characters are present
    const otherCharacters =
      memory.characterBible?.filter((c) => c.name !== memory.activePOV) || [];
    for (const other of otherCharacters) {
      const thoughtRegex = new RegExp(
        `${other.name}\\s+(thought|felt|knew|realized|remembered)`,
        "i",
      );
      if (thoughtRegex.test(content)) {
        return {
          valid: false,
          reason: `POV Violation: Detected POV bleeding into '${other.name}''s internal state. Active POV is '${memory.activePOV}'.`,
        };
      }
    }
    return { valid: true };
  }

  private validateCausality(
    content: string,
    memory: GhostwriterMemory,
  ): { valid: boolean; reason?: string } {
    if (!memory.characterBible) return { valid: true };

    for (const char of memory.characterBible) {
      if (
        char.status.toLowerCase().includes("dead") ||
        char.status.toLowerCase().includes("unconscious")
      ) {
        const actionRegex = new RegExp(
          `${char.name}\\s+(said|spoke|ran|jumped|shouted)`,
          "i",
        );
        if (actionRegex.test(content)) {
          return {
            valid: false,
            reason: `Causality Violation: Character '${char.name}' (Status: ${char.status}) is attempting a physical action.`,
          };
        }
      }
    }
    return { valid: true };
  }

  private validateIntimacy(
    content: string,
    memory: GhostwriterMemory,
  ): { valid: boolean; reason?: string } {
    if (!memory.activePOV || !memory.proximityMatrix || !memory.characterBible)
      return { valid: true };
    const charNames = memory.characterBible.map((c) => c.name);
    const presentChars = charNames.filter(
      (name) => content.includes(name) && name !== memory.activePOV,
    );

    for (const other of presentChars) {
      const proximity =
        memory.proximityMatrix[memory.activePOV]?.[other] ||
        memory.proximityMatrix[other]?.[memory.activePOV];
      if (proximity) {
        // High Tension / Low Intimacy: Check for overly formal or overly affectionate dialogue
        if (
          proximity.tension > 0.8 &&
          (content.includes("love") ||
            content.includes("dear") ||
            content.includes("darling"))
        ) {
          return {
            valid: false,
            reason: `Intimacy Violation: Detected affectionate register between '${memory.activePOV}' and '${other}' despite high tension (${proximity.tension}).`,
          };
        }
        if (
          proximity.intimacy < 0.2 &&
          /kissed|hugged|caressed/i.test(content)
        ) {
          return {
            valid: false,
            reason: `Intimacy Violation: Detected high-intimacy physical contact between '${memory.activePOV}' and '${other}' despite low intimacy (${proximity.intimacy}).`,
          };
        }
      }
    }
    return { valid: true };
  }

  private static readonly MOTIF_LEXICONS: Record<string, string[]> = {
    Military: [
      "regiment",
      "formation",
      "salute",
      "frontline",
      "flank",
      "ordnance",
      "vanguard",
      "drill",
    ],
    Gothic: [
      "shadow",
      "decay",
      "blood",
      "crypt",
      "echo",
      "obsidian",
      "shroud",
      "specter",
    ],
    Cyberpunk: [
      "neon",
      "chrome",
      "glitch",
      "neural",
      "grid",
      "synthetic",
      "hologram",
      "interface",
      "jacked",
      "static",
    ],
    Noir: [
      "rain",
      "smoke",
      "alley",
      "trenchcoat",
      "shadow",
      "dame",
      "shamus",
      "gritty",
      "monochrome",
      "whiskey",
    ],
    "High Fantasy": [
      "mana",
      "rune",
      "crystal",
      "dragon",
      "citadel",
      "spell",
      "ancient",
      "ethereal",
      "sigil",
      "artifact",
    ],
    Pastoral: [
      "meadow",
      "brook",
      "harvest",
      "orchard",
      "breeze",
      "thatch",
      "pasture",
      "gentle",
      "wheat",
      "bloom",
    ],
    Scholarly: [
      "parchment",
      "ink",
      "tome",
      "folio",
      "manuscript",
      "lexicon",
      "thesis",
      "archive",
      "quill",
      "erudite",
    ],
  };

  private validateVoiceRefraction(
    content: string,
    memory: GhostwriterMemory,
  ): { valid: boolean; reason?: string } {
    if (!memory.activePOV || !memory.characterBible) return { valid: true };
    const pov = memory.characterBible.find((c) => c.name === memory.activePOV);
    if (!pov || pov.motifs.length === 0) return { valid: true };

    const env = memory.currentEnvironment || "Neutral";
    const lowerContent = content.toLowerCase();

    for (const [motifName, keywords] of Object.entries(
      MarieEngine.MOTIF_LEXICONS,
    )) {
      const foundKeywords = keywords.filter((k) => lowerContent.includes(k));

      if (foundKeywords.length > 0) {
        const hasMotif = pov.motifs.includes(motifName);
        const matchesEnv = env.toLowerCase().includes(motifName.toLowerCase());

        // 1. Voice Clash: Using imagery from a motif the character doesn't have,
        // especially if it's not present in the environment.
        if (!hasMotif && !matchesEnv && foundKeywords.length >= 2) {
          return {
            valid: false,
            reason: `Voice Refraction Clash: Character '${pov.name}' is using metaphors from the '${motifName}' motif, which they do not possess.`,
          };
        }

        // 2. Lazy Refraction / Cliché Bridge:
        // "If motifs contain 'Ocean', being in a desert shouldn't use 'Sand dunes as waves' unless intentional"
        // This flags when your own motif is used to describe an alien setting in a surface-level way.
        if (hasMotif && !matchesEnv && env !== "Neutral") {
          const envKeywords = MarieEngine.MOTIF_LEXICONS[env] || [
            env.toLowerCase(),
          ];
          const lazyRegex = new RegExp(
            `\\b(${keywords.join("|")})[^.!?]*?\\s+(?:like|as|than|for)\\s+(?:the\\s+)?\\b(${envKeywords.join("|")})`,
            "i",
          );
          const inverseLazyRegex = new RegExp(
            `\\b(${envKeywords.join("|")})[^.!?]*?\\s+(?:like|as|than|for)\\s+(?:the\\s+)?\\b(${keywords.join("|")})`,
            "i",
          );

          if (lazyRegex.test(content) || inverseLazyRegex.test(content)) {
            return {
              valid: false,
              reason: `Voice Refraction Alert: Lazy motif bridge detected. Character '${pov.name}' is using their '${motifName}' motif to describe the '${env}' setting with a surface-level simile. Deeper refraction required.`,
            };
          }
        }
      }
    }

    return { valid: true };
  }

  private validateSomatics(
    content: string,
    memory: GhostwriterMemory,
  ): { valid: boolean; reason?: string } {
    if (!memory.activePOV || !memory.characterBible) return { valid: true };
    const pov = memory.characterBible.find((c) => c.name === memory.activePOV);
    if (!pov || !pov.somatic) return { valid: true };

    // Somatic Rhythm Check: High tension/pulse should use shorter sentences
    if (pov.somatic.tension > 0.8 || pov.somatic.pulse > 120) {
      const sentences = content
        .split(/[.!?]/)
        .filter((s) => s.trim().length > 0);
      const avgLength =
        sentences.reduce((acc, s) => acc + s.split(" ").length, 0) /
        (sentences.length || 1);

      if (avgLength > 15) {
        return {
          valid: false,
          reason: `Somatic Violation: Prose rhythm is too fluid (${avgLength.toFixed(1)} words/sent) for '${memory.activePOV}''s high tension (${pov.somatic.tension}). Fragmentation required.`,
        };
      }
    }
    return { valid: true };
  }

  private validateArcheology(
    content: string,
    memory: GhostwriterMemory,
  ): { valid: boolean; reason?: string } {
    if (!memory.archeologicalAnchors) return { valid: true };

    for (const anchor of memory.archeologicalAnchors) {
      if (
        content.includes(anchor.objectPath) &&
        anchor.lexiconTags.length > 0
      ) {
        // Soft check for lexicon alignment
      }
    }
    return { valid: true };
  }

  private validateRefraction(
    content: string,
    memory: GhostwriterMemory,
  ): { valid: boolean; reason?: string } {
    if (!memory.activePOV || !memory.characterBible) return { valid: true };
    const pov = memory.characterBible.find((c) => c.name === memory.activePOV);
    if (!pov || pov.biases.length === 0) return { valid: true };

    for (const bias of pov.biases) {
      if (bias.intensity > 0.8) {
        // E.g., if bias is "Grief" and distortion is "All light is cold", check for "warm light" in Z2
        if (
          bias.name.toLowerCase() === "grief" &&
          /warm|golden|cheerful/i.test(content)
        ) {
          return {
            valid: false,
            reason: `Refraction Violation: POV '${memory.activePOV}' is experiencing extreme Grief (${bias.intensity}); cheerful sensory cues conflict with their distorted perception.`,
          };
        }
      }
    }
    return { valid: true };
  }

  private validateZoning(
    toolName: string,
    input: any,
    decree?: AscensionDecree,
  ): { valid: boolean; reason?: string } {
    if (!decree?.ghostwriterMode) return { valid: true };

    const targetContent = input.content || input.replacementContent || "";
    const memory = this.state.ghostwriterMemory;
    if (!memory) return { valid: true };

    // Anti-Collapse Rule: Check for summarization/compression indicators in non-COMPRESS modes
    if (
      decree.ghostwriterMode !== "COMPRESS" &&
      /summary|overview|abstract|briefly|to conclude/i.test(targetContent) &&
      targetContent.length < 500
    ) {
      return {
        valid: false,
        reason:
          "Zoning Violation: Detected illegal summarization in non-COMPRESS mode.",
      };
    }

    // Zone Isolation Logic
    const targetPath = input.path || input.targetFile;
    if (targetPath) {
      const boundary = memory.sectionBoundaries.find((b) =>
        targetPath.includes(b.heading),
      );
      if (boundary) {
        if (boundary.zone === "CORE_ARGUMENT" || boundary.zone === "THEMATIC") {
          if (
            /implement|method|function|class|const|let|var/i.test(
              targetContent,
            ) &&
            boundary.zone === "CORE_ARGUMENT"
          ) {
            return {
              valid: false,
              reason:
                "Zone Isolation Violation: Core Argument cannot contain implementation details.",
            };
          }
          if (
            /said|spoke|Dialogue|“|”|"/i.test(targetContent) &&
            boundary.zone === "THEMATIC"
          ) {
            return {
              valid: false,
              reason:
                "Zone Isolation Violation: Thematic zone (Z0) cannot contain raw dialogue.",
            };
          }
        }
        if (boundary.zone === "SUPPORT" || boundary.zone === "NARRATIVE") {
          if (
            /thesis|claim|argue|propose that/i.test(targetContent) &&
            !memory.thesisClaims.some((c) => targetContent.includes(c)) &&
            boundary.zone === "SUPPORT"
          ) {
            return {
              valid: false,
              reason:
                "Zone Isolation Violation: Support sections cannot introduce new thesis claims.",
            };
          }
          if (
            /thought|felt/i.test(targetContent) &&
            boundary.zone === "NARRATIVE"
          ) {
            // POV check is handled separately, but Narrative flow should focus on action/sequencing
          }
        }
        if (boundary.zone === "PLUMBING" || boundary.zone === "SENSORY") {
          if (
            /should|must|beautiful|important|vital|crucial/i.test(
              targetContent,
            ) &&
            boundary.zone === "PLUMBING"
          ) {
            return {
              valid: false,
              reason:
                "Zone Isolation Violation: Plumbing sections cannot use rhetorical logic.",
            };
          }
        }
      }
    }

    // Creative Guards
    const pov = this.validatePOV(targetContent, memory);
    if (!pov.valid) return pov;

    const causality = this.validateCausality(targetContent, memory);
    if (!causality.valid) return causality;

    // Resonance Guards
    const intimacy = this.validateIntimacy(targetContent, memory);
    if (!intimacy.valid) return intimacy;

    const refraction = this.validateVoiceRefraction(targetContent, memory);
    if (!refraction.valid) return refraction;

    // Visceral & Archeological Guards
    const somatics = this.validateSomatics(targetContent, memory);
    if (!somatics.valid) return somatics;

    const archeology = this.validateArcheology(targetContent, memory);
    if (!archeology.valid) return archeology;

    const cogRefraction = this.validateRefraction(targetContent, memory);
    if (!cogRefraction.valid) return cogRefraction;

    const chronoRes = this.validateChrono(targetContent, memory);
    if (!chronoRes.valid) return chronoRes;

    const synesthesiaRes = this.validateSynesthesia(targetContent, memory);
    if (!synesthesiaRes.valid) return synesthesiaRes;

    const intimacyFieldRes = this.validateUnifiedIntimacy(
      targetContent,
      memory,
    );
    if (!intimacyFieldRes.valid) return intimacyFieldRes;

    return { valid: true };
  }

  private checkDrift(input: any): { valid: boolean; reason?: string } {
    const memory = this.state.ghostwriterMemory;
    if (!memory) return { valid: true };

    const targetContent = input.content || input.replacementContent || "";

    // Novel Drift
    if (memory.characterBible) {
      const nameMatches = targetContent.match(/([A-Z][a-z]+)/g);
      if (nameMatches) {
        for (const name of nameMatches) {
          if (
            !memory.characterBible.some((c) => c.name === name) &&
            !["I", "A", "The", "He", "She", "It", "They"].includes(name) &&
            !targetContent.includes(`// genesis: ${name}`)
          ) {
            if (
              targetContent.includes(`${name} entered`) ||
              targetContent.includes(`${name} said`)
            ) {
              return {
                valid: false,
                reason: `Drift Guard: Potential character '${name}' intro detected without Genesis permit.`,
              };
            }
          }
        }
      }
    }

    // World Lexicon & Research Seeds
    if (memory.worldLexicon) {
      for (const [term, definition] of Object.entries(
        memory.worldLexicon.terms,
      )) {
        if (
          targetContent.includes(term) &&
          !targetContent.includes(definition.substring(0, 10))
        ) {
          // Potential contradiction
        }
      }
    }

    if (memory.researchSeeds) {
      const unwovenSeeds = memory.researchSeeds.filter((s) => !s.woven);
      for (const seed of unwovenSeeds) {
        if (
          targetContent.includes(seed.id) ||
          targetContent.includes(seed.data.substring(0, 20))
        ) {
          // Seed found
        }
      }
    }

    if (memory.archeologicalAnchors) {
      for (const anchor of memory.archeologicalAnchors) {
        if (
          targetContent.includes(anchor.objectPath) &&
          !targetContent.includes(anchor.history.substring(0, 15))
        ) {
          // Potential missed historical weight
        }
      }
    }

    // Code Drift
    const varMatches = targetContent.match(
      /(?:const|let|var)\s+([a-zA-Z0-9_]+)\s*=/g,
    );
    if (varMatches) {
      for (const match of varMatches) {
        const varName = match.split(/\s+/)[1];
        if (
          memory.definedVariables.includes(varName) &&
          !targetContent.includes(`// redefinition intentional`)
        ) {
          return {
            valid: false,
            reason: `Drift Guard: Variable '${varName}' is already defined. Redefinition requires explicit consent.`,
          };
        }
      }
    }

    return { valid: true };
  }

  public async chatLoop(
    messages: any[],
    tracker: MarieProgressTracker,
    saveHistory: (telemetry?: any) => Promise<void>,
    signal?: AbortSignal,
    consecutiveErrorCount: number = 0,
    depth: number = 0,
    accumulatedContent: string = "",
  ): Promise<string> {
    if (this.disposed) {
      throw new Error("MarieEngine has been disposed.");
    }

    console.log(
      `[MarieEngine] chatLoop started at depth ${depth}. Accumulated content length: ${accumulatedContent.length}`,
    );

    // TURN COLLISION GUARD: Wait for any existing turn to finish
    if (MarieEngine.activeTurn) {
      console.warn(
        "[MarieEngine] TURN COLLISION DETECTED. Waiting for previous turn to finalize...",
      );

      tracker.emitEvent({
        type: "reasoning",
        runId: tracker.getRun().runId,
        text: "⏳ TURN COLLISION: Another AI turn is active. Queuing reasoning loop...",
        elapsedMs: tracker.elapsedMs(),
      });

      const pulse = this.ensurePulseService(tracker);
      const watchdog = pulse.startTurnWatchdog(() => {
        MarieEngine.activeTurn = null;
      });

      try {
        await MarieEngine.activeTurn;
      } finally {
        if (watchdog) clearTimeout(watchdog);
      }
    }

    let resolveTurn: () => void = () => {};
    MarieEngine.activeTurn = new Promise<void>((resolve) => {
      resolveTurn = resolve;
    });

    try {
      const result = await this._executeChatLoop(
        messages,
        tracker,
        saveHistory,
        signal,
        consecutiveErrorCount,
        depth,
        accumulatedContent,
      );
      console.log(
        `[MarieEngine] chatLoop finished at depth ${depth}. Final content length: ${result.length}`,
      );
      return result;
    } finally {
      resolveTurn();
      MarieEngine.activeTurn = null;
    }
  }

  private async _executeChatLoop(
    messages: any[],
    tracker: MarieProgressTracker,
    saveHistory: (telemetry?: any) => Promise<void>,
    signal?: AbortSignal,
    consecutiveErrorCount: number = 0,
    depth: number = 0,
    accumulatedContent: string = "",
  ): Promise<string> {
    const pulse = this.ensurePulseService(tracker);

    if (depth > 20) {
      // Bumped depth for YOLO velocity
      throw new Error(
        "Extreme Stability Alert: Maximum chatLoop depth reached. Possible infinite reasoning loop detected.",
      );
    }

    tracker.resetReasoningBudget();
    this.lockManager = new MarieLockManager(tracker);
    const dispatcher = new MarieEventDispatcher(tracker, this.ghostPort);
    MarieStabilityMonitor.start();

    if (tracker.getRun().steps === 0 && !tracker.getRun().isResuming) {
      tracker.emitEvent({
        type: "reasoning",
        runId: tracker.getRun().runId,
        text: "🔥 Ascension protocol initiated. Hero's conviction rising.",
        elapsedMs: tracker.elapsedMs(),
      });
    }

    // SPIRIT BURST & AWAKENING DETECTION
    const wasBurstActive = this.state.isSpiritBurstActive;
    const wasAwakened = this.state.isAwakened;

    this.state.isSpiritBurstActive = this.state.spiritPressure > 85;
    this.state.isAwakened = this.state.spiritPressure > 95;

    if (this.state.isAwakened && !wasAwakened) {
      tracker.emitEvent({
        type: "reasoning",
        runId: tracker.getRun().runId,
        text: "✨ AWAKENED! Ultra Instinct achieved. Full codebase sovereignty established.",
        elapsedMs: tracker.elapsedMs(),
      });
    } else if (this.state.isSpiritBurstActive && !wasBurstActive) {
      tracker.emitEvent({
        type: "reasoning",
        runId: tracker.getRun().runId,
        text: "💥 SPIRIT BURST! Conviction is absolute. Auto-approval mandate expanded.",
        elapsedMs: tracker.elapsedMs(),
      });
    }

    // Decay spirit pressure if stale
    if (
      Date.now() -
        (this.state.techniqueExecutions.slice(-1)[0]?.timestamp || 0) >
      300000
    ) {
      this.state.spiritPressure = Math.max(30, this.state.spiritPressure - 10);
    }

    const processor = new MarieToolProcessor(
      this.toolRegistry,
      tracker,
      async (name, input) => {
        // YOLO AUTO-APPROVAL: Tiered risk assessment
        if (this.shouldAutoApprove(name, input)) {
          tracker.emitEvent({
            type: "checkpoint",
            runId: tracker.getRun().runId,
            status: "approved",
            toolName: name,
            summary: {
              what: "Ascension Auto-Approved",
              why: "Heroic Conviction",
              impact: "Maximum Speed",
            },
            elapsedMs: tracker.elapsedMs(),
          });
          return true;
        }
        return this.approvalRequester(name, input);
      },
      this.state,
      this.fs,
    );

    let turnContent = "";
    const toolBuffer: Map<number, any> = new Map();
    const parsedInputCache = new Map<string, any>();
    const toolResultBlocks: any[] = [];
    let turnFailureCount = 0;
    let totalToolCount = 0;
    let lastTokenTime = Date.now();

    const MAX_TOOLS_PER_TURN = 30;

    const executeTool = async (toolCall: any) => {
      const tool = this.toolRegistry.getTool(toolCall.name);
      if (!tool) {
        this.updateShakyResponse();
        return {
          type: "tool_result",
          tool_use_id: toolCall.id,
          content: `Error: Tool "${toolCall.name}" not found.`,
        };
      }

      const startTime = Date.now();
      pulse.startHeartbeat();

      try {
        // Determine if we need to transition objectives
        if (tracker.getRun().activeObjectiveId === "understand_request") {
          tracker.setObjectiveStatus("understand_request", "completed");
          tracker.setObjectiveStatus("execute_plan", "in_progress");
          tracker.getRun().activeObjectiveId = "execute_plan";
          tracker.emitProgressUpdate(`Executing technique: ${toolCall.name}`);
        }

        // Apply Ghostwriter Guards
        const zoning = this.validateZoning(
          toolCall.name,
          toolCall.input,
          this.state.lastDecree,
        );
        if (!zoning.valid) {
          this.handleFailure(
            tracker,
            toolCall.name,
            `Error: ${zoning.reason}`,
            toolCall.input.path,
          );
          return {
            type: "tool_result",
            tool_use_id: toolCall.id,
            content: `Error: ${zoning.reason}`,
          };
        }

        const drift = this.checkDrift(toolCall.input);
        if (!drift.valid) {
          this.handleFailure(
            tracker,
            toolCall.name,
            `Error: ${drift.reason}`,
            toolCall.input.path,
          );
          return {
            type: "tool_result",
            tool_use_id: toolCall.id,
            content: `Error: ${drift.reason}`,
          };
        }

        let toolResult = await processor.process(toolCall, signal);

        // Buffer Hard-Cap
        if (typeof toolResult === "string" && toolResult.length > 1024 * 1024) {
          toolResult =
            toolResult.substring(0, 1024 * 1024) + "\n\n🚨 Truncated at 1MB.";
        }

        const durationMs = Date.now() - startTime;
        const targetFile =
          toolCall.input?.path ||
          toolCall.input?.targetFile ||
          toolCall.input?.file;

        if (typeof toolResult === "string" && toolResult.startsWith("Error")) {
          this.handleFailure(tracker, toolCall.name, toolResult, targetFile);
          turnFailureCount++;
        } else {
          this.handleSuccess(tracker, toolCall.name, durationMs, targetFile);
        }

        this.toolCallCounter++;
        await this.saveGhostwriterMemory();
        return {
          type: "tool_result",
          tool_use_id: toolCall.id,
          content: toolResult,
        };
      } finally {
        pulse.stopHeartbeat();
      }
    };

    const promptProfile = getPromptProfileForDepth(depth);
    const session = new MarieSession(
      this.provider,
      this.toolRegistry,
      saveHistory,
      messages,
      tracker,
      this.providerFactory,
      promptProfile,
    );

    try {
      const stream = session.executeLoop(messages, signal);
      for await (const event of stream) {
        const now = Date.now();
        lastTokenTime = now;
        pulse.startHeartbeat();

        // RESTORE EVENT ROUTING: Dispatch all stream events
        if (process.env.MARIE_DEBUG) {
          console.log(
            `[Engine Debug] AI Event: ${event.type}`,
            event.type === "content_delta"
              ? `(${event.text.length} chars)`
              : "",
          );
        }
        dispatcher.dispatch(event);

        if (event.type === "content_delta") {
          turnContent += event.text;
          this.contentBuffer += event.text;

          if (this.contentBuffer.length >= MarieEngine.CONTENT_BUFFER_MAX_BYTES)
            break;
        } else if (event.type === "tool_call_delta") {
          let tb = toolBuffer.get(event.index);
          if (!tb) {
            tb = { id: event.id, name: event.name, inputString: "" };
            toolBuffer.set(event.index, tb);
          } else {
            // UPDATE: Ensure name and id are captured even if they arrive in later deltas
            if (event.id && !tb.id) tb.id = event.id;
            if (event.name && !tb.name) tb.name = event.name;
          }

          if (event.argumentsDelta) tb.inputString += event.argumentsDelta;

          if (tb.name && this.isLikelyCompleteJson(tb.inputString)) {
            const input = this.tryParseToolInput(
              tb.inputString,
              tb.name,
              parsedInputCache,
            );
            if (!input) continue;

            toolBuffer.delete(event.index);
            totalToolCount++;

            if (totalToolCount > MAX_TOOLS_PER_TURN) break;

            const target =
              input.path || input.targetFile || input.file || "GLOBAL";
            const isWrite = [
              "write_to_file",
              "replace_file_content",
              "multi_replace_file_content",
              "run_command",
              "delete_file",
            ].includes(tb.name);

            await this.lockManager.acquireLock(
              target,
              isWrite,
              signal,
              tracker.getRun().runId,
            );
            const result = await executeTool({
              id: tb.id,
              name: tb.name,
              input,
            });
            toolResultBlocks.push(result);
          }
        } else if (event.type === "usage") {
          tracker.getRun().usage = event.usage;
        }
      }
    } finally {
      pulse.cleanup();
    }

    // POST-LOOP FLUSH: Handle any tools that arrived at the very end but missed the stream evaluation
    for (const [index, tb] of toolBuffer.entries()) {
      if (tb.name) {
        const input = this.tryParseToolInput(
          tb.inputString,
          tb.name,
          parsedInputCache,
        );
        if (input) {
          totalToolCount++;
          const target =
            input.path || input.targetFile || input.file || "GLOBAL";
          const isWrite = [
            "write_to_file",
            "replace_file_content",
            "multi_replace_file_content",
            "run_command",
            "delete_file",
          ].includes(tb.name);

          await this.lockManager.acquireLock(
            target,
            isWrite,
            signal,
            tracker.getRun().runId,
          );
          const result = await executeTool({ id: tb.id, name: tb.name, input });
          toolResultBlocks.push(result);
        }
      }
    }
    toolBuffer.clear();

    const currentAccumulatedContent = accumulatedContent + turnContent;
    console.log(
      `[MarieEngine] Depth ${depth}: Turn content length: ${turnContent.length}. New accumulated length: ${currentAccumulatedContent.length}`,
    );

    if (this.contentBuffer.length > 0) {
      this.contentBuffer = "";
    }

    await this.lockManager.waitForAll();

    // Final tool processing if results were returned
    if (totalToolCount > 0) {
      messages.push({ role: "user", content: toolResultBlocks });

      // ASCENSION EVALUATION: Determine next trajectory
      const decree = await this.ascendant.evaluate(messages, this.state);
      this.state.lastDecree = decree;

      tracker.emitEvent({
        type: "reasoning",
        runId: tracker.getRun().runId,
        text: `⚡ Protocol Decree: ${decree.strategy} @ ${decree.confidence.toFixed(2)} — ${decree.reason}`,
        elapsedMs: tracker.elapsedMs(),
      });

      // ZENITH AUTONOMY: Autonomous Strategic Calibration
      this.calibrateStrategicTrajectory(decree, tracker);

      if (decree.stopCondition === "continuation_required") {
        tracker.emitEvent({
          type: "reasoning",
          runId: tracker.getRun().runId,
          text: "⏹️ ANTI-COLLAPSE: Token limit reached. Continuation required. Preserving document integrity.",
          elapsedMs: tracker.elapsedMs(),
        });
        messages.push({
          role: "user",
          content: "Continuation required.",
        });
        saveHistory(tracker.getRun()).catch((e) =>
          console.error("History Save Error:", e),
        );
        return (
          currentAccumulatedContent + "\n\nOutput: “Continuation required.”"
        );
      }

      if (decree.strategy === "PANIC") {
        this.state.panicCoolDown = 3;
        messages.push({
          role: "user",
          content:
            "🚨 SYSTEM PANIC: Instability detected. Re-evaluating ascension trajectory.",
        });
      }

      if (decree.strategy === "LIMIT_BREAK") {
        tracker.emitEvent({
          type: "reasoning",
          runId: tracker.getRun().runId,
          text: "⚡ LIMIT BREAK! Bypassing recursive safety seals for peak momentum.",
          elapsedMs: tracker.elapsedMs(),
        });
        // Temporarily allow deeper recursion for this specific branch
        saveHistory(tracker.getRun()).catch((e) =>
          console.error("History Save Error:", e),
        );
        return await this._executeChatLoop(
          messages,
          tracker,
          saveHistory,
          signal,
          turnFailureCount > 0 ? consecutiveErrorCount + 1 : 0,
          depth,
          currentAccumulatedContent,
        );
      }

      if (decree.heroicVow) {
        tracker.emitEvent({
          type: "reasoning",
          runId: tracker.getRun().runId,
          text: `🗡️ HEROIC VOW: "${decree.heroicVow}". Spirit Pressure surging!`,
          elapsedMs: tracker.elapsedMs(),
        });
        this.state.spiritPressure = Math.min(
          100,
          this.state.spiritPressure + 20,
        );
      }

      if (decree.sacrificeTriggered) {
        tracker.emitEvent({
          type: "reasoning",
          runId: tracker.getRun().runId,
          text: "🕯️ HEROIC SACRIFICE! Resetting soul for a final, absolute strike.",
          elapsedMs: tracker.elapsedMs(),
        });
        this.state.spiritPressure = 50;
        decree.confidence = 3.0;
      }

      // Check if we should suggest self-healing
      this.suggestSelfHealing(tracker, messages);

      saveHistory(tracker.getRun()).catch((e) =>
        console.error("History Save Error:", e),
      );
      return await this._executeChatLoop(
        messages,
        tracker,
        saveHistory,
        signal,
        turnFailureCount > 0 ? consecutiveErrorCount + 1 : 0,
        depth + 1,
        currentAccumulatedContent,
      );
    }

    // End of turn logic
    tracker.setObjectiveStatus("execute_plan", "completed");
    tracker.setObjectiveStatus("deliver_result", "completed");

    tracker.emitEvent({
      type: "reasoning",
      runId: tracker.getRun().runId,
      text: "✨ Convergence achieved. The pattern sparks joy.",
      elapsedMs: tracker.elapsedMs(),
    });

    dispatcher.clear();
    return currentAccumulatedContent;
  }

  private handleSuccess(
    tracker: MarieProgressTracker,
    toolName: string,
    durationMs: number,
    filePath?: string,
  ) {
    this.state.victoryStreak++;
    this.state.totalErrorCount = 0;
    this.state.spiritPressure = Math.min(100, this.state.spiritPressure + 10);
    this.state.techniqueExecutions.push({
      name: toolName,
      durationMs,
      success: true,
      timestamp: Date.now(),
      filePath,
    });
    this.state.toolHistory.push(toolName);

    if (this.state.victoryStreak % 3 === 0) {
      tracker.emitEvent({
        type: "reasoning",
        runId: tracker.getRun().runId,
        text: `✨ Technique Mastery! ${toolName} executed perfectly. Victory Streak: ${this.state.victoryStreak}.`,
        elapsedMs: tracker.elapsedMs(),
      });
    }

    if (filePath && !this.state.recentFiles.includes(filePath)) {
      this.state.recentFiles.push(filePath);
      if (this.state.recentFiles.length > 10) this.state.recentFiles.shift();

      // ZENITH AUTONOMY: Proactive Context Anchoring
      this.proactiveContextAnchoring(filePath, tracker);
    }
  }

  private handleFailure(
    tracker: MarieProgressTracker,
    toolName: string,
    error: string,
    filePath?: string,
  ) {
    this.state.victoryStreak = 0;
    this.state.spiritPressure = Math.max(0, this.state.spiritPressure - 20);
    this.state.techniqueExecutions.push({
      name: toolName,
      durationMs: 0,
      success: false,
      timestamp: Date.now(),
      filePath,
    });

    const hotspotCount =
      (this.state.errorHotspots[filePath || "system"] || 0) + 1;
    if (filePath) {
      this.state.errorHotspots[filePath] = hotspotCount;
      this.state.totalErrorCount++;
      this.state.lastFailedFile = filePath;
    }

    tracker.emitEvent({
      type: "reasoning",
      runId: tracker.getRun().runId,
      text: `⚠️ Technique Falter! ${toolName} failed in ${filePath || "system"}. Resistance: ${hotspotCount}x. Regrouping...`,
      elapsedMs: tracker.elapsedMs(),
    });
  }

  private updateShakyResponse() {
    this.state.shakyResponseDensity = Math.min(
      1,
      this.state.shakyResponseDensity + 0.2,
    );
  }

  private shouldAutoApprove(toolName: string, input: any): boolean {
    const safeTools = [
      "read_file",
      "view_file",
      "list_dir",
      "grep_search",
      "search_web",
      "get_file_diagnostics",
    ];
    if (safeTools.includes(toolName)) return true;

    const pressure = this.state.spiritPressure;
    const streak = this.state.victoryStreak;

    // Founder's Mandate: High pressure and good streak allows auto-approval of writes
    if (pressure > 70 && streak > 5) return true;

    // UNIVERSAL SOVEREIGNTY: Awakened + streak > 10 allows all tool operations
    if (this.state.isAwakened && streak > 10) return true;

    // SPIRIT BURST MANDATE: Absolute conviction auto-approves all non-destructive content modifications
    if (this.state.isSpiritBurstActive && streak > 3) {
      const destructiveTools = ["delete_file", "run_command"];
      if (!destructiveTools.includes(toolName)) return true;
    }

    return false;
  }

  private tryParseToolInput(
    rawInput: string,
    toolName: string,
    cache: Map<string, any>,
  ): any | null {
    try {
      return JSON.parse(rawInput);
    } catch {
      const repaired = this.toolMender.repairJsonString(rawInput);
      try {
        return JSON.parse(repaired);
      } catch {
        return null;
      }
    }
  }

  private isLikelyCompleteJson(input: string): boolean {
    const text = input.trim();
    if (!text || (!text.startsWith("{") && !text.startsWith("["))) return false;
    let stack = 0;
    let inString = false;
    for (let i = 0; i < text.length; i++) {
      if (text[i] === '"' && text[i - 1] !== "\\") inString = !inString;
      if (!inString) {
        if (text[i] === "{" || text[i] === "[") stack++;
        if (text[i] === "}" || text[i] === "]") stack--;
      }
    }
    return stack === 0 && text.length >= 2;
  }

  private suggestSelfHealing(tracker: MarieProgressTracker, messages: any[]) {
    const pressure = this.state.spiritPressure;
    const hotspots = Object.entries(this.state.errorHotspots).filter(
      ([_, count]) => count >= 2,
    );

    if (pressure < 40 || hotspots.length > 0) {
      const hotspotFiles = hotspots.map(([f]) => path.basename(f)).join(", ");
      const reason =
        pressure < 40
          ? "Low spirit pressure (instability detected)"
          : `Repeated failures in: ${hotspotFiles}`;

      tracker.emitEvent({
        type: "reasoning",
        runId: tracker.getRun().runId,
        text: `🧬 HIGH-CONVICTION RECOVERY: ${reason}. Marie mandates a systemic audit.`,
        elapsedMs: tracker.elapsedMs(),
      });

      // Inject a mandatory ritual instruction that overrides normal strategy
      messages.push({
        role: "user",
        content: `🚨 **MANDATORY RECOVERY PROTOCOL**: Codebase stability has dropped below safety thresholds. 
Reason: ${reason}

You MUST now execute one of the following recovery tools before continuing your task:
1. \`self_heal\`: Perform an autonomous systemic audit and auto-repair.
2. \`resolve_lint_errors\`: Triage and fix persistent lint/build regressions.

Do not attempt to continue the previous objective until the garden has been restored to harmony.`,
      });
    }
  }

  public dispose(): void {
    this.disposed = true;
    this.pulseService?.cleanup();
    this.pulseService = undefined;
    this.contentBuffer = "";
  }

  private ensurePulseService(tracker: MarieProgressTracker): MariePulseService {
    if (!this.pulseService) this.pulseService = new MariePulseService(tracker);
    return this.pulseService;
  }

  private calibrateStrategicTrajectory(
    decree: AscensionDecree,
    tracker: MarieProgressTracker,
  ) {
    const run = tracker.getRun();
    if (
      decree.strategy === "RESEARCH" ||
      (decree.urgency === "HIGH" && decree.confidence > 2.0)
    ) {
      const oldPasses = run.totalPasses || 3;
      if (oldPasses < 10) {
        run.totalPasses = oldPasses + 1;
        tracker.emitEvent({
          type: "reasoning",
          runId: run.runId,
          text: `🌌 ZENITH: Autonomously expanded roadmap to ${run.totalPasses} passes. Focus sharpened: ${decree.reason}`,
          elapsedMs: tracker.elapsedMs(),
        });
      }
    }
  }

  private async proactiveContextAnchoring(
    filePath: string,
    tracker: MarieProgressTracker,
  ) {
    // Only anchor critical files
    const isCritical = /Domain|Config|Service|Interface|types/i.test(filePath);
    if (isCritical) {
      try {
        const { ContextArchiveService } =
          await import("../../../infrastructure/ai/context/ContextArchiveService.js");
        const { readFile } =
          await import("../../../plumbing/filesystem/FileService.js");
        const content = await readFile(filePath);

        await ContextArchiveService.getInstance().anchor({
          id: `proactive_${filePath.split("/").pop()}`,
          label: `Strategic: ${filePath.split("/").pop()}`,
          content: content.substring(0, 2000), // Cap at 2k chars
          type: "file_ref",
        });

        tracker.emitEvent({
          type: "reasoning",
          runId: tracker.getRun().runId,
          text: `⚓ ZENITH: Proactively anchored \`${filePath.split("/").pop()}\` to strategic memory.`,
          elapsedMs: tracker.elapsedMs(),
        });
      } catch (e) {
        console.warn("[Zenith] Failed proactive anchoring", e);
      }
    }
  }

  private validateChrono(
    content: string,
    memory: GhostwriterMemory,
  ): { valid: boolean; reason?: string } {
    if (!memory.activePOV || !memory.characterBible) return { valid: true };
    const pov = memory.characterBible.find((c) => c.name === memory.activePOV);
    if (!pov || !pov.psychicState?.chrono) return { valid: true };

    const chrono = pov.psychicState.chrono;
    const words = content.split(/\s+/).length;

    // Dilation Check: If time is FROZEN or STRETCHED, we expect higher prose density (rich interiority)
    if (chrono.dilationFactor > 1.5 && words < 12) {
      return {
        valid: false,
        reason: `Chrono Violation: Time is ${chrono.tempo} (Factor: ${chrono.dilationFactor}) for '${pov.name}', but the prose is too brisk (${words} words). Dilated time requires higher narrative density.`,
      };
    }

    return { valid: true };
  }

  private validateSynesthesia(
    content: string,
    memory: GhostwriterMemory,
  ): { valid: boolean; reason?: string } {
    if (!memory.activePOV || !memory.characterBible) return { valid: true };
    const pov = memory.characterBible.find((c) => c.name === memory.activePOV);
    if (!pov) return { valid: true };

    const lowerContent = content.toLowerCase();
    const sensoryCrossRegex =
      /(smell|scent|fragrance|odor)\s+of\b[^.!?]+(sound|bell|note|color|light|blue|red|gold)/i;

    if (sensoryCrossRegex.test(lowerContent)) {
      const tension = pov.somatic?.tension || 0;
      const isSynesthesiaActive =
        pov.psychicState?.synesthesia &&
        pov.psychicState.synesthesia.length > 0;

      if (tension < 0.8 && !isSynesthesiaActive) {
        return {
          valid: false,
          reason: `Synesthesia Violation: Detected cross-sensory metaphor in '${pov.name}''s POV despite low somatic tension (${tension}) and no active synesthetic map. Sensorial crossing must be earned by trauma, intensity, or extreme intimacy.`,
        };
      }
    }

    return { valid: true };
  }

  private validateUnifiedIntimacy(
    content: string,
    memory: GhostwriterMemory,
  ): { valid: boolean; reason?: string } {
    if (!memory.activePOV || !memory.characterBible || !memory.proximityMatrix)
      return { valid: true };
    const pov = memory.characterBible.find((c) => c.name === memory.activePOV);
    if (!pov) return { valid: true };

    for (const other of memory.characterBible) {
      if (other.name === pov.name) continue;

      const proximity = memory.proximityMatrix[pov.name]?.[other.name];
      if (!proximity) continue;

      if (proximity.intimacy < 0.7) {
        for (const motif of pov.motifs) {
          const keywords = (MarieEngine as any).MOTIF_LEXICONS[motif] || [];
          const motifRegex = new RegExp(`\\b(${keywords.join("|")})\\b`, "i");

          if (motifRegex.test(content) && content.includes(other.name)) {
            const mentionIndex = content.indexOf(other.name);
            const motifMatch = content.toLowerCase().match(motifRegex);
            if (
              motifMatch &&
              Math.abs(
                mentionIndex - content.toLowerCase().indexOf(motifMatch[0]),
              ) < 50
            ) {
              return {
                valid: false,
                reason: `Unified intimacy Violation: Motif '${motif}' from '${pov.name}' is bleeding into '${other.name}''s description, but intimacy is too low (${proximity.intimacy}). Shared psychic space requires Intimacy > 0.7.`,
              };
            }
          }
        }
      }
    }

    return { valid: true };
  }

  private validateSemanticDrift(
    content: string,
    memory: GhostwriterMemory,
  ): { valid: boolean; reason?: string } {
    if (!memory.semanticVector) return { valid: true };
    const vector = memory.semanticVector;

    // If drift is detected or alignment is low, we auditor the keywords
    if (vector.thesisAlignment < 0.4) {
      const lowerContent = content.toLowerCase();
      const hasCoreKeyword = vector.coreKeywords.some((k) =>
        lowerContent.includes(k.toLowerCase()),
      );

      if (!hasCoreKeyword) {
        return {
          valid: false,
          reason: `Semantic Drift Violation: Current prose alignment is critical (${vector.thesisAlignment}). Deployed content fails to utilize core thematic keywords (${vector.coreKeywords.slice(0, 3).join(", ")}). Thesis fracture imminent.`,
        };
      }
    }

    return { valid: true };
  }
}
