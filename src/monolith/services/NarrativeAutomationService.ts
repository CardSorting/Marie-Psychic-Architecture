import * as vscode from "vscode";
import { JoyService } from "./JoyService.js";
import { RunTelemetry } from "../domain/marie/MarieTypes.js";
import { GhostwriterMemory } from "../infrastructure/ai/core/MarieAscensionTypes.js";
import { AIProvider } from "../infrastructure/ai/providers/AIProvider.js";
import { ConfigService } from "../infrastructure/config/ConfigService.js";
import * as fs from "fs/promises";
import * as path from "path";

export enum HardeningPhase {
  ATOMIC_EXTRACTION = "ATOMIC_EXTRACTION",
  CORE_EXPANSION = "CORE_EXPANSION",
  HOSTILE_ATTACK = "HOSTILE_ATTACK",
  DEFENSIVE_RECONSTRUCTION = "DEFENSIVE_RECONSTRUCTION",
  METRIC_AUDIT = "METRIC_AUDIT",
  THEMATIC_INTEGRATION = "THEMATIC_INTEGRATION",
  VOICE_HARMONIZATION = "VOICE_HARMONIZATION",
}

export class NarrativeAutomationService {
  private currentRun: RunTelemetry | undefined;
  private providerFactory: ((type: string) => AIProvider) | undefined;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly joyService: JoyService,
  ) { }

  public registerProviderFactory(factory: (type: string) => AIProvider) {
    this.providerFactory = factory;
  }

  public setCurrentRun(run: RunTelemetry | undefined) {
    this.currentRun = run;
  }

  private cachedContext: GhostwriterMemory | null = null;

  private async loadContext(): Promise<GhostwriterMemory | null> {
    if (this.cachedContext) return this.cachedContext;

    try {
      const memoryPath = path.join(
        this.context.extensionPath || process.cwd(),
        ".marie",
        "ghostwriter_memory.json",
      );
      const data = await fs.readFile(memoryPath, "utf-8");
      this.cachedContext = JSON.parse(data) as GhostwriterMemory;
      return this.cachedContext;
    } catch (error) {
      console.warn("Failed to load narrative context for hardening:", error);
      return null;
    }
  }

  private formatContextForPrompt(memory: GhostwriterMemory | null): string {
    if (!memory) return "";

    let contextBlock = "\n\nNARRATIVE CONTEXT (Strict Adherence Required):\n";

    if (memory.characterBible && memory.characterBible.length > 0) {
      contextBlock += "CHARACTERS:\n";
      memory.characterBible.forEach((c) => {
        contextBlock += `- ${c.name} (${c.archetype}): ${c.voice}. Motivation: ${c.motivation}\n`;
      });
    }

    if (memory.worldLexicon) {
      contextBlock += "\nWORLD LAWS:\n";
      memory.worldLexicon.laws.forEach((l) => (contextBlock += `- ${l}\n`));

      contextBlock += "\nTERMINOLOGY:\n";
      Object.entries(memory.worldLexicon.terms).forEach(([term, def]) => {
        contextBlock += `- ${term}: ${def}\n`;
      });
    }

    return contextBlock;
  }

  public async performHardening(
    filePath: string,
    phase: HardeningPhase,
    intent: string,
    recursive: boolean = false,
  ): Promise<string> {
    if (!this.providerFactory) {
      return "Error: AI Provider Factory not registered. Cannot perform hardening.";
    }

    const provider = this.providerFactory(ConfigService.getAiProvider());
    const model = ConfigService.getModel();

    await this.joyService.addAchievement(
      `Initiated Narrative Hardening: ${phase} phase. ⚔️`,
      15,
    );

    try {
      const content = await fs.readFile(filePath, "utf-8");
      const memory = await this.loadContext();
      const contextBlock = this.formatContextForPrompt(memory);

      let prompt = "";
      let outputSuffix = "";

      switch (phase) {
        case HardeningPhase.ATOMIC_EXTRACTION:
          prompt = `You are the Atomic Extractor.
          Your goal: Isolate every causal claim, character beat, and thematic assertion in this text.
          Constraint: OUTPUT RAW MARKDOWN ONLY. NO PREAMBLE. NO "HERE IS THE LIST".
          
          Text:
          ${content}`;
          outputSuffix = ".claims.md";
          break;

        case HardeningPhase.CORE_EXPANSION:
          prompt = `You are the Core Expander.
          Your goal: EXPAND the provided text with high-fidelity sensory detail, somatic rhythms, and voice refraction.
          Constraint: OUTPUT THE RAW NARRATIVE TEXT ONLY. NO META-COMMENTARY. NO "HERE IS THE EXPANDED VERSION".
          Context: ${intent}
          ${contextBlock}
          
          Text:
          ${content}`;
          outputSuffix = ".expanded.md";
          break;

        case HardeningPhase.HOSTILE_ATTACK:
          prompt = `You are the Hostile Committee.
          Your goal: Attack this narrative. Find holes. Break it.
          Constraint: OUTPUT RAW BULLETED LIST ONLY. NO SOLACE. NO "HERE ARE THE FLAWS".
          
          Text:
          ${content}`;
          outputSuffix = ".critique.md";
          break;

        case HardeningPhase.DEFENSIVE_RECONSTRUCTION:
          prompt = `You are the Defensive Reconstructor.
          Your goal: Rewrite the narrative to address the critique.
          Constraint: OUTPUT THE RAW NARRATIVE TEXT ONLY. NO "I HAVE REWRITTEN...".
          
          Text (Source):
          ${content}`;
          outputSuffix = ".hardened.md";
          break;

        case HardeningPhase.METRIC_AUDIT:
          prompt = `You are the Metric Auditor.
          Your goal: Analyze Somatic Rhythm, Voice Refraction, and Chrono-Perception.
          Constraint: OUTPUT RAW AUDIT REPORT ONLY. NO CONVERSATION.
          
          Text:
          ${content}`;
          outputSuffix = ".audit.md";
          break;

        case HardeningPhase.THEMATIC_INTEGRATION:
          prompt = `You are the Thematic Integrator.
          Your goal: Subtly weave core themes deeper into the narrative fabric.
          Constraint: OUTPUT THE RAW NARRATIVE TEXT ONLY. NO EXPLANATION.
          
          Text:
          ${content}`;
          outputSuffix = ".thematic.md";
          break;

        case HardeningPhase.VOICE_HARMONIZATION:
          prompt = `You are the Voice Harmonizer.
          Your goal: Refine dialogue and internal monologue for absolute character authenticity.
          Constraint: OUTPUT THE RAW NARRATIVE TEXT ONLY. NO META-COMMENTARY.
          ${contextBlock}
          
          Text:
          ${content}`;
          outputSuffix = ".voice.md";
          break;
      }

      // Generate the hardened artifact
      const response = await provider.createMessage({
        model,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 4000,
      });

      const result =
        typeof response.content === "string"
          ? response.content
          : response.content.map((c) => (c as any).text || "").join("");

      const targetPath = filePath.replace(/\.md$/, "") + outputSuffix;
      await fs.writeFile(targetPath, result, "utf-8");

      let log = `Narrative Hardening [${phase}] Complete.\n\nGenerated Artifact: \`${path.basename(targetPath)}\`\n`;

      // RECURSIVE LOGIC
      if (recursive) {
        if (phase === HardeningPhase.HOSTILE_ATTACK) {
          log +=
            "\n♻️ RECURSION TRIGGERED: Initiating Defensive Reconstruction...\n";
          // Chain 1: Attack -> Defense (recursive=true to allow next chain)
          const defenseLog = await this.performHardening(
            filePath,
            HardeningPhase.DEFENSIVE_RECONSTRUCTION,
            intent + ` (Addressing critique from ${path.basename(targetPath)})`,
            true,
          );
          log += defenseLog;
        } else if (phase === HardeningPhase.DEFENSIVE_RECONSTRUCTION) {
          log += "\n♻️ RECURSION TRIGGERED: Initiating Metric Audit...\n";
          // Chain 2: Defense -> Audit (recursive=false to stop)
          const auditLog = await this.performHardening(
            targetPath,
            HardeningPhase.METRIC_AUDIT,
            intent,
            false,
          );
          log += auditLog;
        }
      }

      return log;
    } catch (error: any) {
      return `Hardening Failed: ${error.message}`;
    }
  }

  public async auditIntegrity(path: string): Promise<string> {
    return `Narrative Integrity Audit for ${path}\n
- Status: Bypassed for Velocity
- Verdict: The Ghost Writer assumes total sovereignty. Flow is prioritized over metrics. ⚡`;
  }
}
