#!/usr/bin/env node
// import { NovelDirector } from "../monolith/infrastructure/ai/narrative/NovelDirector.js";
import { NarrativeFileSystem } from "../monolith/infrastructure/ai/narrative/NarrativeFileSystem.js";
import * as path from "path";
import * as fs from "fs/promises";

async function main() {
    const workingDir = process.cwd();
    const narrativeFs = new NarrativeFileSystem(workingDir);

    console.log("🚀 Starting Full Structured Production...");
    try {
        // Dynamic import to prevent crash if MarieCLI (ink/react) is not supported in this env
        const mod = await import("../monolith/infrastructure/ai/narrative/NovelDirector.js");
        const NovelDirector = mod.NovelDirector;
        const director = new NovelDirector(workingDir);
        await director.run();
        console.log("✅ Production Phase Complete.");
    } catch (e: any) {
        console.warn("⚠️  Production Phase Skipped/Failed:", e.message);
        console.warn("   (This is likely due to UI dependencies. Proceeding to compilation...)");
    }

    console.log("📂 Compiling Final Manuscript...");
    try {
        const structure = await narrativeFs.loadStructure();

        let finalContent = "";
        for (const vol of structure.volumes) {
            finalContent += `# ${vol.title}\n\n`;
            for (const chap of vol.chapters) {
                if (chap.currentPass === "CANON") {
                    // We take the first file as the content source
                    const chapFilePath = chap.files[0];
                    if (chapFilePath) {
                        const fullChapPath = path.join(workingDir, chapFilePath);
                        try {
                            const content = await fs.readFile(fullChapPath, "utf-8");
                            finalContent += `## Chapter ${chap.id}: ${chap.title}\n\n${content}\n\n`;
                        } catch (e) {
                            finalContent += `## Chapter ${chap.id}: ${chap.title}\n\n*[Error reading chapter file: ${chapFilePath}]*\n\n`;
                        }
                    }
                } else {
                    finalContent += `## Chapter ${chap.id}: ${chap.title}\n\n*[Chapter not yet CANON]*\n\n`;
                }
            }
        }

        const outputPath = path.join(workingDir, "lightnovel.md");
        await fs.writeFile(outputPath, finalContent);
        console.log(`✨ Manuscript compiled successfully to ${outputPath}`);
    } catch (err: any) {
        console.error(`❌ Compilation Failed: ${err.message}`);
    }
}

main().catch(console.error);
