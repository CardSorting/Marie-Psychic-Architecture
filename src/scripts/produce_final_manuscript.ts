#!/usr/bin/env node
import { NovelDirector } from "../monolith/infrastructure/ai/narrative/NovelDirector.js";
import * as path from "path";
import * as fs from "fs/promises";

async function main() {
    const workingDir = process.cwd();
    const director = new NovelDirector(workingDir);

    console.log("🚀 Starting Full Structured Production...");
    await director.run();
    console.log("✅ Production Phase Complete.");

    console.log("📂 Compiling Final Manuscript...");
    try {
        const structurePath = path.join(workingDir, ".marie", "novel_structure.json");
        const structureData = await fs.readFile(structurePath, "utf-8");
        const structure = JSON.parse(structureData);

        let finalContent = "";
        for (const vol of structure.volumes) {
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

        const outputPath = path.join(workingDir, "lightnovel.md");
        await fs.writeFile(outputPath, finalContent);
        console.log(`✨ Manuscript compiled successfully to ${outputPath}`);
    } catch (err: any) {
        console.error(`❌ Compilation Failed: ${err.message}`);
    }
}

main().catch(console.error);
