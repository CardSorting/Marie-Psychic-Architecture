
import { NarrativeFileSystem } from "../../infrastructure/ai/narrative/NarrativeFileSystem.js";
import * as path from "path";

export async function printNovelStatus(workingDir: string) {
    const fs = new NarrativeFileSystem(workingDir);
    await fs.initialize();

    console.log("📚 Scanning Novel Structure...\n");

    const structure = await fs.loadStructure();

    if (structure.volumes.length === 0) {
        console.log("⚠️  No volumes found in 'novel/' directory.");
        return;
    }

    let totalWords = 0;

    for (const vol of structure.volumes) {
        console.log(`📦 [${vol.status}] Volume ${vol.id}: ${vol.title}`);

        if (vol.chapters.length === 0) {
            console.log("    (No chapters)");
        }

        for (const chap of vol.chapters) {
            const symbols: Record<string, string> = {
                "BLUEPRINT": "📐",
                "SKELETON": "💀",
                "FLESH": "🥩",
                "NERVE": "⚡️",
                "SOUL": "👻",
                "CANON": "✅",
                "DRAFT": "📝",
                "REVIEW": "👀",
                "POLISH": "✨",
                "FINAL": "🏆",
                "SIMULATION": "🎲",
                "FOUNDATION": "🏗️",
                "BEATS": "🥁",
                "COHESION": "🔗"
            };
            const icon = symbols[chap.currentPass] || "📄";

            // Files check
            const fileCount = chap.files.length;
            const fileIndicator = fileCount > 0 ? `(${fileCount} files)` : "⚠️  No files";

            // Word count
            const wc = chap.wordCount || 0;
            totalWords += wc;
            const wcStr = wc > 0 ? `${wc}w` : "";

            console.log(`    ${icon} Chapter ${chap.id}: ${chap.title.padEnd(30)} [${chap.currentPass.padEnd(10)}] ${wcStr.padEnd(8)} ${fileIndicator}`);
        }
        console.log("");
    }

    console.log(`Total Word Count: ${totalWords}`);
}
