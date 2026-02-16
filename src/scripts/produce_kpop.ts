#!/usr/bin/env node
import { ContentDirector } from "../monolith/infrastructure/ai/narrative/ContentDirector.js";
import { NovelProductionService } from "../monolith/infrastructure/ai/narrative/NovelProductionService.js";

async function main() {
    const workingDir = process.cwd();
    const service = new NovelProductionService(workingDir);
    await service.initialize();

    const activeChapter = service.getActiveChapter();
    if (!activeChapter) {
        console.log("🚀 Initializing K-POP EMPIRE Volume & Track...");
        await service.startNewChapter(
            "Neon Dreams",
            "A high-energy K-pop single about a futuristic cyberpunk Seoul. Themes of neon lights, digital romance, and high-frequency energy. Aim for Billboard 100 Dominance with the Empire Pass.",
            "MUSIC_STUDIO"
        );
    } else {
        console.log(`📡 Resuming production for: ${activeChapter.title} (Mode: ${activeChapter.mode})`);
    }

    const director = new ContentDirector(workingDir);
    await director.run("MUSIC_STUDIO");
}

main().catch(err => {
    console.error("🛑 K-Pop Director Failed:", err);
    process.exit(1);
});
