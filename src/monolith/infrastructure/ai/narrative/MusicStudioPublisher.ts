import * as fs from "node:fs/promises";
import * as path from "path";
import { NovelVolume, NovelChapter } from "./NovelProductionService.js";
import { readSafe } from "./ProductionUtils.js";

export class MusicStudioPublisher {
    constructor(private workingDir: string) { }

    public async publishEP(
        volume: NovelVolume,
        studioBrief: string
    ): Promise<string> {
        const projectDirName = volume.title.replace(/[^a-z0-9]/gi, "_");
        const exportRoot = path.join(this.workingDir, "projects", projectDirName);

        await fs.mkdir(exportRoot, { recursive: true });

        // 1. Briefing Directory
        const briefingRoot = path.join(exportRoot, "01_Briefing");
        await fs.mkdir(briefingRoot, { recursive: true });
        await fs.writeFile(path.join(briefingRoot, "Studio_Brief.md"), studioBrief);

        // 2. Mastered Tracks Directory
        const masterRoot = path.join(exportRoot, "02_Mastered_Tracks");
        await fs.mkdir(masterRoot, { recursive: true });

        // Sort tracks by ID or scheduled date
        const sortedTracks = [...volume.chapters].sort((a, b) => {
            const dateA = new Date(a.scheduledDate || 0).getTime();
            const dateB = new Date(b.scheduledDate || 0).getTime();
            return dateA - dateB;
        });

        const projectMap = new Map<string, NovelChapter[]>();
        for (const track of sortedTracks) {
            if (track.currentPass !== "CANON") continue;
            const date = new Date(track.scheduledDate || new Date());
            const dateStr = date.toISOString().split('T')[0];
            if (!projectMap.has(dateStr)) projectMap.set(dateStr, []);
            projectMap.get(dateStr)!.push(track);
        }

        const dashboard: string[] = [
            `# Project Dashboard: ${volume.title}`,
            `\n## 👑 Empire North Star (Iconic Standard)\n\n${studioBrief.split('\n')[0]}...\n\n[Read Full Studio Brief](./01_Briefing/Studio_Brief.md)`,
            `\n## 📈 Production Cycle: The Empire Pass\n`,
            `The project follows a rigorous 10-phase production cycle for absolute global dominance:`,
            `1. **The Brief**: Strategic global airplay targeting.`,
            `2. **Hook Isolation**: Selection of the iconic earworm motif.`,
            `3. **Beat Sheet**: Structural alignment with the Empire formula.`,
            `4. **Recording**: Capturing the raw legendary performance.`,
            `5. **Re-Amping**: Recursive layering for deep resonance.`,
            `6. **Polarization**: Injecting unignorable cultural 'edge'.`,
            `7. **Localization**: Universal theme calibration for global reach.`,
            `8. **Mix & Master**: Final iconic polish and viral audit.`,
            `9. **Viral Promo**: Social media asset and hook generation.`,
            `10. **Canon**: Iconic (Empire Certified) status.`,
            `\n## 📅 Release Schedule\n`,
            `| Track | Release Time | Format | Title | Action |`,
            `| :--- | :--- | :--- | :--- | :--- |`
        ];

        let trackCounter = 1;
        const sortedDates = Array.from(projectMap.keys()).sort();

        // 3. Marketing Bundle Directory
        const marketingRoot = path.join(exportRoot, "03_Marketing_Bundle");
        await fs.mkdir(marketingRoot, { recursive: true });

        for (const dateStr of sortedDates) {
            const tracks = projectMap.get(dateStr)!;

            for (const track of tracks) {
                const date = new Date(track.scheduledDate || new Date());
                const timeStr = date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }).replace(/:/g, "");
                const safeTitle = track.title.replace(/[^a-z0-9]/gi, "_").substring(0, 30);

                const trackDirName = `Track_${trackCounter.toString().padStart(2, '0')}_${safeTitle}`;
                const trackDir = path.join(masterRoot, trackDirName);
                await fs.mkdir(trackDir, { recursive: true });

                // Read final content (Iconic/Empire Master)
                const contentPath = path.join(this.workingDir, track.files[0] || "");
                const content = await readSafe(contentPath);

                // Read strategy (The Brief)
                const strategyPath = contentPath.replace("content.md", "concept.md");
                const strategy = await readSafe(strategyPath);

                // Read Promo (Marketing Assets)
                const promoPath = contentPath.replace("content.md", "promo.md");
                const promo = await readSafe(promoPath);

                // Export files for review
                await fs.writeFile(path.join(trackDir, "01_Empire_Master.md"), content);
                await fs.writeFile(path.join(trackDir, "02_Session_Context.md"), strategy);

                if (promo) {
                    const promoExportPath = path.join(marketingRoot, `Promo_${trackCounter.toString().padStart(2, '0')}_${safeTitle}.md`);
                    await fs.writeFile(promoExportPath, promo);
                }

                // Extract Viral Snippet if present (Simulated stem export)
                if (content.includes("VIRAL SNIPPET") || content.includes("TIKTOK MOMENT")) {
                    const stemsDir = path.join(trackDir, "Stems");
                    await fs.mkdir(stemsDir, { recursive: true });
                    const snippet = content.match(/VIRAL SNIPPET.*?\n(.*?)\n/s)?.[1] || "Snippet Pending...";
                    await fs.writeFile(path.join(stemsDir, "Viral_Snippet.md"), snippet);
                }

                const specs = {
                    trackNumber: trackCounter,
                    releaseTime: date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
                    iso: track.scheduledDate,
                    title: track.title,
                    certification: "EMPIRE_CERTIFIED"
                };
                await fs.writeFile(path.join(trackDir, "03_Release_Specs.json"), JSON.stringify(specs, null, 2));

                const relativePath = `./02_Mastered_Tracks/${trackDirName}`;
                dashboard.push(`| Track ${trackCounter} | ${specs.releaseTime} | EMPIRE SINGLE | ${track.title} | [Review Master](${relativePath}/01_Empire_Master.md) |`);
                trackCounter++;
            }
        }

        dashboard.push(`\n## 🛠️ Global Manager Instructions (Empire Tier)\n`);
        dashboard.push(`1. **Review Master**: Open each \`01_Empire_Master.md\` linked above.`);
        dashboard.push(`2. **Audit Marketing Bundle**: Check \`03_Marketing_Bundle\` for social assets.`);
        dashboard.push(`3. **Verify Global Reach**: Ensure the track follows the iconic standard.`);
        dashboard.push(`4. **Deploy**: Use the \`03_Release_Specs.json\` for global distribution.`);

        await fs.writeFile(path.join(exportRoot, "README.md"), dashboard.join('\n'));

        return exportRoot;
    }
}
