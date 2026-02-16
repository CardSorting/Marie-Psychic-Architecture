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
import { WorldService } from "../infrastructure/ai/narrative/WorldService.js";

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
        mode: {
          type: "string",
          description: "Production mode: 'ESSAY' (default) or 'STRUCTURED'",
          enum: ["ESSAY", "STRUCTURED"]
        },
      },
      required: ["outlinePath"],
    },
    execute: async (args) => {
      const p = getStringArg(args, "outlinePath");
      const mode = getStringArg(args, "mode") || "ESSAY"; // Default to ESSAY

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
        await novelService.startNewChapter(chap.title, chap.description.trim(), mode);
      }

      return `Successfully initialized novel with ${chapters.length} chapters from ${p} in ${mode} mode.`;
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
      const activeChap = novelService.getActiveChapter();

      if (!activeChap) {
        return "Error: No active chapter found.";
      }

      const result = await novelService.advancePass(activeChap, summary);
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

  // ─── World Building Tools ────────────────────────────────────

  const worldService = new WorldService(workingDir);

  registry.register({
    name: "add_world_entity",
    description: "Add a new entity (Location, Character, Faction, etc.) to the World Bible.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        type: { type: "string", enum: ["LOCATION", "FACTION", "CHARACTER", "OBJECT", "EVENT", "CONCEPT"] },
        description: { type: "string" },
        attributes: { type: "object", description: "Key-value pairs of attributes" },
        tags: { type: "array", items: { type: "string" } }
      },
      required: ["name", "type", "description"]
    },
    execute: async (args) => {
      await worldService.initialize();
      const name = getStringArg(args, "name");
      const type = getStringArg(args, "type");
      const description = getStringArg(args, "description");
      const attributes = (args.attributes as Record<string, string>) || {};
      const tags = (args.tags as string[]) || [];

      const id = `ent_${name.toLowerCase().replace(/\s+/g, "_")}_${Date.now().toString(36)}`;

      await worldService.addEntity({
        id,
        name,
        type: type as any,
        description,
        attributes,
        relationships: [],
        tags
      });

      return `Added world entity: ${name} (${type})`;
    }
  });

  registry.register({
    name: "view_world_bible",
    description: "View the current state of the World Bible.",
    input_schema: {
      type: "object",
      properties: {
        filterType: { type: "string", description: "Filter by entity type" }
      }
    },
    execute: async (args) => {
      await worldService.initialize();
      const bible = worldService.getBible();
      const filterType = getStringArg(args, "filterType");

      let output = `[WORLD BIBLE: ${bible.name}]\n${bible.overview}\n\n`;

      if (bible.entities.length === 0) {
        output += "No entities defined yet.";
      } else {
        output += "ENTITIES:\n";
        const entitieser = filterType
          ? bible.entities.filter(e => e.type === filterType)
          : bible.entities;

        entitieser.forEach(e => {
          output += `\n[${e.type}] ${e.name}\n${e.description}\n`;
          if (Object.keys(e.attributes).length > 0) {
            output += `Attributes: ${JSON.stringify(e.attributes)}\n`;
          }
        });
      }

      return output;
    }
  });

  registry.register({
    name: "update_world_state",
    description: "Apply a JSON delta to the World Bible (New Entities, Events, etc.).",
    input_schema: {
      type: "object",
      properties: {
        delta: {
          type: "object",
          description: "The WorldDelta JSON object",
          properties: {
            newEntities: { type: "array" },
            updatedEntities: { type: "array" },
            newEvents: { type: "array" },
            relationshipChanges: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  sourceId: { type: "string" },
                  targetId: { type: "string" },
                  newType: { type: "string" },
                  description: { type: "string" }
                },
                required: ["sourceId", "targetId", "newType"]
              }
            }
          }
        }
      },
      required: ["delta"]
    },
    execute: async (args) => {
      await worldService.initialize();
      const delta = args.delta;
      await worldService.applyWorldDelta(delta);
      return "World state updated successfully.";
    }
  });

  registry.register({
    name: "advance_world_time",
    description: "Advance the world clock by a number of days.",
    input_schema: {
      type: "object",
      properties: {
        days: { type: "number", description: "Number of days to advance" }
      },
      required: ["days"]
    },
    execute: async (args) => {
      await worldService.initialize();
      const days = Number(args.days);
      await worldService.advanceTime(days);
      const season = worldService.getCurrentSeason();
      const date = worldService.getBible().currentDate;
      return `Time advanced by ${days} days. It is now ${season}, Year ${date?.year} Month ${date?.month} Day ${date?.day}.`;
    }
  });

  registry.register({
    name: "check_world_consistency",
    description: "Check a text or file for consistency against the World Bible.",
    input_schema: {
      type: "object",
      properties: {
        text: { type: "string" },
        filePath: { type: "string" }
      }
    },
    execute: async (args) => {
      await worldService.initialize();
      let content = "";
      if (args.filePath) {
        const fullPath = path.isAbsolute(args.filePath as string) ? args.filePath as string : path.join(workingDir, args.filePath as string);
        content = await fs.readFile(fullPath, "utf-8");
      } else if (args.text) {
        content = args.text as string;
      } else {
        return "Error: Must provide text or filePath.";
      }

      const issues = await worldService.validateConsistency(content);
      if (issues.length === 0) {
        return "No consistency issues found.";
      }
      return `Consistency Issues Found:\n${issues.join("\n")}`;
    }
  });

  registry.register({
    name: "compile_manuscript",
    description: "Compile all CANON chapters into a single lightnovel.md manuscript.",
    input_schema: {
      type: "object",
      properties: {
        outputPath: { type: "string", description: "Path to write the final manuscript" }
      },
      required: ["outputPath"]
    },
    execute: async (args) => {
      await novelService.initialize();
      const outputPath = getStringArg(args, "outputPath");
      const fullOutputPath = path.isAbsolute(outputPath) ? outputPath : path.join(workingDir, outputPath);

      const structure = (novelService as any).structure;
      if (!structure || !structure.volumes) return "Error: No novel structure found.";

      let finalContent = "";
      const volumes = structure.volumes;

      for (const vol of volumes) {
        finalContent += `# ${vol.title}\n\n`;
        for (const chap of vol.chapters) {
          if (chap.currentPass === "CANON") {
            const chapFilePath = chap.files[0];
            if (chapFilePath) {
              const fullChapPath = path.join(workingDir, chapFilePath);
              try {
                const content = await fs.readFile(fullChapPath, "utf-8");
                finalContent += `## Chapter ${chap.id}: ${chap.title}\n\n${content}\n\n`;
              } catch (e) {
                finalContent += `## Chapter ${chap.id}: ${chap.title}\n\n*[Error reading chapter file]*\n\n`;
              }
            }
          } else {
            finalContent += `## Chapter ${chap.id}: ${chap.title}\n\n*[Chapter not yet CANON]*\n\n`;
          }
        }
      }

      await fs.writeFile(fullOutputPath, finalContent);
      return `Manuscript compiled successfully to ${outputPath}`;
    }
  });
}
