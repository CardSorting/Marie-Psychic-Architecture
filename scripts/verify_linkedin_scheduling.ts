import { ContentDirector } from '../src/monolith/infrastructure/ai/narrative/ContentDirector.js';
import { NovelProductionService } from '../src/monolith/infrastructure/ai/narrative/NovelProductionService.js';
import * as fs from 'fs/promises';
import * as path from 'path';

async function testScheduling() {
    const workingDir = process.cwd();
    const director = new ContentDirector(workingDir);
    const prodSvc = (director as any).productionSvc as NovelProductionService;

    console.log("Testing LinkedIn Scheduling Logic...");

    // Mock a structure with scheduled chapters
    const now = new Date();
    const future = new Date();
    future.setDate(now.getDate() + 1);

    const mockup = {
        volumes: [{
            id: 1,
            title: "Test Campaign",
            chapters: [
                {
                    id: 1,
                    title: "Past Post",
                    mode: "LINKEDIN",
                    currentPass: "STRATEGY",
                    scheduledDate: new Date(Date.now() - 10000).toISOString()
                },
                {
                    id: 2,
                    title: "Future Post",
                    mode: "LINKEDIN",
                    currentPass: "STRATEGY",
                    scheduledDate: future.toISOString()
                }
            ]
        }]
    };

    (prodSvc as any).structure = mockup;

    // Test findActiveChapter
    const active = (director as any).findActiveChapter("LINKEDIN");

    if (active && active.ch.title === "Past Post") {
        console.log("✅ Success: Director correctly found the past post.");
    } else {
        console.log("❌ Failure: Director found wrong post or nothing:", active?.ch.title);
    }

    const futureActive = mockup.volumes[0].chapters.find(c => c.title === "Future Post");
    if (active && active.ch.id === futureActive?.id) {
        console.log("❌ Failure: Director picked a future post.");
    } else {
        console.log("✅ Success: Director correctly ignored the future post.");
    }
}

testScheduling().catch(console.error);
