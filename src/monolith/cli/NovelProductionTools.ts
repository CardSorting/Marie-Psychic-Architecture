import { ToolRegistry } from "../infrastructure/tools/ToolRegistry.js";
import {
  getStringArg,
  getBooleanArg,
} from "../infrastructure/tools/ToolUtils.js";
import { NovelProductionService } from "../infrastructure/ai/narrative/NovelProductionService.js";
import {
  NarrativeAutomationServiceCLI,
  HardeningPhase,
} from "../services/NarrativeAutomationServiceCLI.js";
import * as fs from "fs/promises";
import * as path from "path";

export function registerNovelTools(
  registry: ToolRegistry,
  novelService: NovelProductionService,
  narrativeAutomation: NarrativeAutomationServiceCLI,
  workingDir: string,
) {
  registry.register({
    name: "initiate_novel_from_outline",
    description:
      "Ingest a lightnovel.md outline and initialize the production structure.",
    input_schema: {
      type: "object",
      properties: {
        outlinePath: { type: "string", description: "Path to lightnovel.md" },
      },
      required: ["outlinePath"],
    },
    execute: async (args) => {
      const p = getStringArg(args, "outlinePath");
      const fullPath = path.isAbsolute(p) ? p : path.join(workingDir, p);
      const content = await fs.readFile(fullPath, "utf-8");

      // Basic parser for the outline
      const lines = content.split("\n");
      const chapters: { title: string; description: string }[] = [];
      let currentChapter: { title: string; description: string } | null = null;

      for (const line of lines) {
        const chapterMatch = line.match(/^Chapter \d+ — (.+)/);
        if (chapterMatch) {
          if (currentChapter) chapters.push(currentChapter);
          currentChapter = { title: chapterMatch[1], description: "" };
        } else if (currentChapter && line.trim() && !line.startsWith("Arc")) {
          currentChapter.description += line.trim() + " ";
        }
      }
      if (currentChapter) chapters.push(currentChapter);

      await novelService.initialize();

      // Idempotency Check: usage of checks to prevent duplication
      const currentContext = novelService.getActiveContext();
      if (!currentContext.includes("No active volume")) {
        return "Novel structure already initialized. Skipping to avoid duplicates.";
      }

      for (const chap of chapters) {
        await novelService.startNewChapter(chap.title, chap.description.trim());
      }

      return `Successfully initialized novel with ${chapters.length} chapters from ${p}.`;
    },
  });

  registry.register({
    name: "advance_novel_pass",
    description:
      "End the current pass, lock files, and advance the chapter to the next phase.",
    input_schema: {
      type: "object",
      properties: {
        summary: {
          type: "string",
          description: "Summary of what was achieved in this pass.",
        },
      },
      required: ["summary"],
    },
    execute: async (args) => {
      await novelService.initialize(); // Ensure fresh state
      const summary = getStringArg(args, "summary");
      const result = await novelService.advancePass(summary);
      return result.message;
    },
  });

  registry.register({
    name: "harden_narrative",
    description:
      "Run the Recursive Narrative Hardening Engine on a specific file.",
    input_schema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Path to the markdown file to harden",
        },
        phase: {
          type: "string",
          enum: Object.values(HardeningPhase),
          description: "The hardening phase to execute",
        },
        intent: {
          type: "string",
          description: "The artistic intent for this hardening pass",
        },
        recursive: {
          type: "boolean",
          description: "Whether to trigger the recursive hardening loop",
        },
      },
      required: ["path", "phase", "intent"],
    },
    execute: async (args) => {
      const p = getStringArg(args, "path");
      const phase = getStringArg(args, "phase") as HardeningPhase;
      const intent = getStringArg(args, "intent");
      const recursive = getBooleanArg(args, "recursive") ?? false;

      return await narrativeAutomation.performHardening(
        p,
        phase,
        intent,
        recursive,
      );
    },
  });

  registry.register({
    name: "get_novel_status",
    description: "Get the current state of the novel production pipeline.",
    input_schema: { type: "object", properties: {} },
    execute: async () => {
      return novelService.getActiveContext();
    },
  });
}
