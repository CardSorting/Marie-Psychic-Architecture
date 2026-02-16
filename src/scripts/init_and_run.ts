import { NovelProductionService } from "../monolith/infrastructure/ai/narrative/NovelProductionService.js";
import { NovelDirector } from "../monolith/infrastructure/ai/narrative/NovelDirector.js";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
    const workingDir = process.cwd();
    const novelService = new NovelProductionService(workingDir);
    await novelService.initialize();

    // 1. Initial Identity Check
    const structure = (novelService as any).structure;
    const hasChapters = structure.volumes?.some((v: any) => v.chapters.length > 0);

    if (!hasChapters) {
        console.log("📜 Novel structure empty. Initializing from lightnovel.md...");
        const outlinePath = path.join(workingDir, "lightnovel.md");
        const content = await fs.readFile(outlinePath, "utf-8");

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

        for (const chap of chapters) {
            await novelService.startNewChapter(chap.title, chap.description.trim(), "STRUCTURED");
        }
        console.log(`✅ Initialized ${chapters.length} chapters in STRUCTURED mode.`);
    }

    // 2. Launch Director
    console.log("🔮 Launching Resilient Sovereign Director...");
    const director = new NovelDirector(workingDir);
    await director.run();
}

main().catch(err => {
    console.error("🛑 Initialization Failed:", err);
    process.exit(1);
});
