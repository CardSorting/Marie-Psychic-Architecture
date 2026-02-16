
import { NarrativeFileSystem } from "../../infrastructure/ai/narrative/NarrativeFileSystem.js";
import * as path from "path";
import * as fs from "fs/promises";

export async function buildManuscript(workingDir: string) {
    const narrativeFs = new NarrativeFileSystem(workingDir);

    console.log("📂 Compiling Final Manuscript...");
    try {
        const structure = await narrativeFs.loadStructure();

        let finalContent = "";
        for (const vol of structure.volumes) {
            finalContent += `# ${vol.title}\n\n`;
            for (const chap of vol.chapters) {
                // We define CANON as the source of truth for the manuscript
                // But for now, let's include anything that has content, marking draft
                const isCanon = chap.currentPass === "CANON";
                const suffix = isCanon ? "" : " (DRAFT)";

                finalContent += `## Chapter ${chap.id}: ${chap.title}${suffix}\n\n`;

                if (chap.files && chap.files.length > 0) {
                    // Primitive heuristic: take the first .md file that looks like content
                    // Ideally we should know which file is THE content.
                    // Usually it's 'content.md' if standard, or 'Chapter_X_Pass_Y.md'

                    // improved logic: look for content.md first
                    let contentFile = chap.files.find(f => f.endsWith("content.md"));
                    if (!contentFile) contentFile = chap.files[0];

                    if (contentFile) {
                        const fullChapPath = path.isAbsolute(contentFile) ? contentFile : path.join(workingDir, contentFile);
                        try {
                            const content = await fs.readFile(fullChapPath, "utf-8");
                            finalContent += `${content}\n\n`;
                        } catch (e) {
                            finalContent += `*[Error reading chapter file: ${contentFile}]*\n\n`;
                        }
                    }
                } else {
                    finalContent += `*[No content files found]*\n\n`;
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
