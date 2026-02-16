
import { NovelProductionService } from "../monolith/infrastructure/ai/narrative/NovelProductionService.js";

async function main() {
    const svc = new NovelProductionService(process.cwd());
    await svc.initialize();

    console.log("Creating test Short Story...");
    const chapter = await svc.startNewChapter(
        "The Last Glitch",
        "A cyberpunk short story about an AI that refuses to be deleted.",
        "SHORT_STORY"
    );

    console.log(`Created Chapter ID: ${chapter.id}, Title: ${chapter.title}, Mode: ${chapter.mode}`);
}

main().catch(console.error);
