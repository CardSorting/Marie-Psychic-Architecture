import { NarrativeFileSystem } from "../monolith/infrastructure/ai/narrative/NarrativeFileSystem.js";
import * as path from "path";
import * as fs from "fs/promises";

async function migrate() {
    const workingDir = process.cwd();
    const legacyPath = path.join(workingDir, ".marie", "novel_structure.json");

    try {
        await fs.access(legacyPath);
    } catch {
        console.log("No legacy structure file found. Skipping migration.");
        return;
    }

    console.log("📦 Found legacy structure. Starting migration...");

    const narrativeFs = new NarrativeFileSystem(workingDir);
    await narrativeFs.initialize();

    const data = await fs.readFile(legacyPath, "utf-8");
    const structure = JSON.parse(data);

    for (const vol of structure.volumes) {
        console.log(`Processing Volume: ${vol.title}`);
        await narrativeFs.saveVolume(vol);

        for (const chap of vol.chapters) {
            console.log(`  - Migrating Chapter ${chap.id}: ${chap.title}`);

            // 1. Create Folder & Metadata
            // We clear the 'files' array in the saved metadata so it relies on auto-discovery
            const metaCopy = { ...chap, files: [] };
            await narrativeFs.saveChapter(vol.id, vol.title, metaCopy);

            // 2. Find and Move Content
            // Strategy: Look for the file in the legacy locations
            const targetDir = await narrativeFs.getChapterDirectory(vol.id, chap.id, chap.title);
            const targetContent = path.join(targetDir, "content.md");

            let sourceContent: string | null = null;

            // Check files listed in JSON
            if (chap.files && chap.files.length > 0) {
                // Try the first one
                const candidate = path.join(workingDir, chap.files[0]);
                try {
                    await fs.access(candidate);
                    sourceContent = candidate;
                } catch { }
            }

            // Check .vault/novel/chapters convention
            if (!sourceContent) {
                const safeTitle = chap.title.replace(/[^a-zA-Z0-9]/g, "_");
                const vaultPath = path.join(workingDir, ".vault", "novel", "chapters", `Chapter_${chap.id}_${safeTitle}.md`);
                try {
                    await fs.access(vaultPath);
                    sourceContent = vaultPath;
                } catch {
                    // Try just ID
                    const simpleVaultPath = path.join(workingDir, ".vault", "novel", "chapters", `Chapter_${chap.id}_.md`);
                    try { await fs.access(simpleVaultPath); sourceContent = simpleVaultPath; } catch { }
                }
            }

            if (sourceContent) {
                console.log(`    -> Moving content from ${path.relative(workingDir, sourceContent)}`);
                await fs.copyFile(sourceContent, targetContent);
            } else {
                console.warn(`    ⚠️ No content file found for Chapter ${chap.id}`);
            }

            // Link Blueprint if exists (optional, but good)
            // ... (skipping for complexity, can be manual)
        }
    }

    console.log("✅ Migration Complete.");
    console.log("ℹ️  You can now delete .marie/novel_structure.json and the .vault/novel folder after verification.");
}

migrate().catch(console.error);
