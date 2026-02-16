#!/usr/bin/env node
import { NarrativeFileSystem } from "../monolith/infrastructure/ai/narrative/NarrativeFileSystem.js";
import * as path from "path";

async function main() {
    const workingDir = process.cwd();
    const fs = new NarrativeFileSystem(workingDir);
    await fs.initialize();

    console.log("📚 Scanning Novel Structure...\n");

    const structure = await fs.loadStructure();

    if (structure.volumes.length === 0) {
        console.log("⚠️  No volumes found in 'novel/' directory.");
        return;
    }

    for (const vol of structure.volumes) {
        console.log(`📦 [${vol.status}] Volume ${vol.id}: ${vol.title}`);

        if (vol.chapters.length === 0) {
            console.log("    (No chapters)");
        }

        for (const chap of vol.chapters) {
            const symbols = {
                "BLUEPRINT": "📐",
                "SKELETON": "💀",
                "FLESH": "🥩",
                "NERVE": "⚡️",
                "SOUL": "👻",
                "CANON": "✅",
                "DRAFT": "📝",
                "REVIEW": "👀",
                "POLISH": "✨",
                "FINAL": "🏆"
            };
            const icon = symbols[chap.currentPass] || "📄";

            // Files check
            const fileCount = chap.files.length;
            const fileIndicator = fileCount > 0 ? `(${fileCount} files)` : "⚠️  No files";

            console.log(`    ${icon} Chapter ${chap.id}: ${chap.title.padEnd(40)} [${chap.currentPass}] ${fileIndicator}`);
        }
        console.log("");
    }
}

main().catch(console.error);
