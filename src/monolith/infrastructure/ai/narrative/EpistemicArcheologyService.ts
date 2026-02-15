import * as fs from "node:fs/promises";
import * as path from "path";
import { EpistemicLayer } from "../core/MarieAscensionTypes.js";

/**
 * Service to scan the filesystem for narrative artifacts.
 * Maps file age, size, and complexity to "Cathedral" lore.
 */
export class EpistemicArcheologyService {
  private static readonly RUIN_THRESHOLD_MS = 90 * 24 * 60 * 60 * 1000; // 90 days
  private static readonly CATHEDRAL_THRESHOLD_LINES = 500;
  private static readonly SPROUT_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours

  /**
   * Scans the given root directory for files that qualify as narrative artifacts.
   */
  public async scanForArtifacts(rootPath: string): Promise<EpistemicLayer[]> {
    const artifacts: EpistemicLayer[] = [];
    try {
      const files = await this.getFiles(rootPath);
      const now = Date.now();

      for (const file of files) {
        // Skip node_modules, .git, etc.
        if (
          file.includes("node_modules") ||
          file.includes(".git") ||
          file.includes("dist")
        )
          continue;

        try {
          const stats = await fs.stat(file);
          const relativePath = path.relative(rootPath, file);

          // Legacy Ruins check
          if (
            now - stats.mtimeMs >
            EpistemicArcheologyService.RUIN_THRESHOLD_MS
          ) {
            artifacts.push({
              objectPath: relativePath,
              history: `[Legacy Ruin] Last touched ${new Date(stats.mtimeMs).toLocaleDateString()}. Assume fragility.`,
              lexiconTags: ["Ancient", "Dusty", "Forgotten"],
            });
          }

          // Sprout check
          if (
            now - stats.birthtimeMs <
            EpistemicArcheologyService.SPROUT_THRESHOLD_MS
          ) {
            artifacts.push({
              objectPath: relativePath,
              history: `[Fresh Sprout] Created ${new Date(stats.birthtimeMs).toLocaleTimeString()}. Needs nurturing.`,
              lexiconTags: ["New", "Green", "Hopeful"],
            });
          }

          // Cathedral check (Requires reading file, lightweight check only for source files)
          if (
            file.endsWith(".ts") ||
            file.endsWith(".js") ||
            file.endsWith(".md")
          ) {
            // We estimate lines by size for speed (avg 40 bytes/line?)
            // Or read first 1kb to check line density?
            // Let's just use size > 20kb as proxy for "Big"
            if (stats.size > 20000) {
              artifacts.push({
                objectPath: relativePath,
                history: `[Cathedral] Massive structure (${(stats.size / 1024).toFixed(1)}KB). Respect the architecture.`,
                lexiconTags: ["Monolithic", "Complex", "Holy"],
              });
            }
          }
        } catch (e) {
          // Ignore access errors
        }
      }
    } catch (e) {
      console.error("Archeology scan failed:", e);
    }
    return artifacts;
  }

  private async getFiles(dir: string): Promise<string[]> {
    const subdirs = await fs.readdir(dir);
    const files: string[] = [];
    await Promise.all(
      subdirs.map(async (subdir) => {
        const res = path.resolve(dir, subdir);
        try {
          const stat = await fs.stat(res);
          if (stat.isDirectory()) {
            // Optimization: Don't recurse into huge dirs
            if (
              subdir === "node_modules" ||
              subdir === ".git" ||
              subdir === "dist"
            )
              return;
            files.push(...(await this.getFiles(res)));
          } else {
            files.push(res);
          }
        } catch (e) {
          // Ignore
        }
      }),
    );
    return files;
  }
}
