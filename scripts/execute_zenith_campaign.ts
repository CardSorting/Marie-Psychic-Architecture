import { ContentDirector } from '../src/monolith/infrastructure/ai/narrative/ContentDirector.js';
import { NarrativeAutomationServiceCLI } from '../src/monolith/services/NarrativeAutomationServiceCLI.js';
import { NovelProductionService } from '../src/monolith/infrastructure/ai/narrative/NovelProductionService.js';
import { JoyServiceCLI } from '../src/monolith/cli/services/JoyServiceCLI.js';

async function main() {
    const workingDir = process.cwd();
    const joyService = new JoyServiceCLI();
    const narrativeSvc = new NarrativeAutomationServiceCLI(workingDir, joyService);
    const prodSvc = new NovelProductionService(workingDir);
    const director = new ContentDirector(workingDir);

    // Register Provider Factory
    const { createDefaultProvider } = await import('../src/monolith/runtime/providerFactory.js');
    const { Storage } = await import('../src/monolith/cli/storage.js');

    narrativeSvc.registerProviderFactory((providerType: string) => {
        const config = Storage.getConfig();
        let key = "";
        if (providerType === "openrouter") key = (config as any).openrouterApiKey || "";
        else if (providerType === "cerebras") key = (config as any).cerebrasApiKey || "";
        else if (providerType === "nvidia") key = (config as any).nvidiaApiKey || "";
        else if (providerType === "moonshot") key = (config as any).moonshotApiKey || "";
        else key = config.apiKey || "";

        return createDefaultProvider(providerType as any, key);
    });

    const theme = "Personifying the Inevitability of Coordination Gravity";
    console.log(`🚀 Zenith Tier Campaign: "${theme}"`);

    // 1. Plan Campaign
    console.log("Planning campaign unit cascade...");
    const plan = await narrativeSvc.generateLinkedInCampaign(theme, 3);
    console.log(`✅ Planned ${plan.length} Zenith-tier units.`);

    // 1.5 Generate Campaign Brief
    console.log("Generating Global Strategy Briefing...");
    const brief = await narrativeSvc.generateCampaignBrief(theme, plan);

    // 2. Seed Units
    await prodSvc.initialize();
    for (const unit of plan) {
        console.log(`🔹 Seeding: ${unit.title} (${unit.scheduledDate})`);
        const ch = await prodSvc.startNewChapter(unit.title, unit.description, "LINKEDIN");
        ch.scheduledDate = unit.scheduledDate;
    }
    await prodSvc.save();

    // 3. Execute
    console.log("\n🎬 Executing Content Production Pipeline...");
    await director.run("LINKEDIN");

    // 4. Publish / Export
    console.log("\n📦 Organizing Campaign for Publication...");
    const { LinkedInPublisher } = await import('../src/monolith/infrastructure/ai/narrative/LinkedInPublisher.js');
    const publisher = new LinkedInPublisher(workingDir);

    // Get the active volume
    const structure = await prodSvc.fs.loadStructure();
    const activeVol = structure.volumes.find(v => v.status === "DRAFT") || structure.volumes[structure.volumes.length - 1];

    const exportPath = await publisher.publishCampaign(activeVol, brief);
    console.log(`\n✨ Campaign Organized & Exported to: ${exportPath}`);
    console.log(`✅ Zenith Tier Execution Complete.`);
}

main().catch(err => {
    console.error("🛑 Zenith Execution Failed:", err);
    process.exit(1);
});
