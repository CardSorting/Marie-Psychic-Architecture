import * as fs from "node:fs/promises";
import * as path from "path";
import { NovelVolume, NovelChapter } from "./NovelProductionService.js";
import { readSafe } from "./ProductionUtils.js";

export class LinkedInPublisher {
    constructor(private workingDir: string) { }

    public async publishCampaign(
        volume: NovelVolume,
        campaignBrief: string
    ): Promise<string> {
        const themeDirName = volume.title.replace(/[^a-z0-9]/gi, "_");
        const exportRoot = path.join(this.workingDir, "campaigns", themeDirName);

        await fs.mkdir(exportRoot, { recursive: true });

        // 1. Briefing Directory
        const briefingRoot = path.join(exportRoot, "01_Briefing");
        await fs.mkdir(briefingRoot, { recursive: true });
        await fs.writeFile(path.join(briefingRoot, "Global_Strategy.md"), campaignBrief);

        // 2. Production-Ready Directory
        const productionRoot = path.join(exportRoot, "02_Production_Ready");
        await fs.mkdir(productionRoot, { recursive: true });

        // Sort chapters by date
        const sortedChaps = [...volume.chapters].sort((a, b) => {
            const dateA = new Date(a.scheduledDate || 0).getTime();
            const dateB = new Date(b.scheduledDate || 0).getTime();
            return dateA - dateB;
        });

        const dayMap = new Map<string, NovelChapter[]>();
        for (const chap of sortedChaps) {
            if (chap.currentPass !== "CANON") continue;
            const date = new Date(chap.scheduledDate || new Date());
            const dateStr = date.toISOString().split('T')[0];
            if (!dayMap.has(dateStr)) dayMap.set(dateStr, []);
            dayMap.get(dateStr)!.push(chap);
        }

        const dashboard: string[] = [
            `# Campaign Dashboard: ${volume.title}`,
            `\n## 🎯 Campaign North Star\n\n${campaignBrief.split('\n')[0]}...\n\n[Read Full Strategy Briefing](./01_Briefing/Global_Strategy.md)`,
            `\n## 📈 Narrative Arc\n`,
            `The campaign follows a "Zenith Cascade" structure:`,
            `1. **Destabilize** (Early Week): Challenge the mundane status quo.`,
            `2. **Pivot** (Mid Week): Introduce the Grounded Reality and Coordination Gravity.`,
            `3. **Escalate & Bless** (Late Week): Finalize the inevitable structural shift.`,
            `\n## 📅 Content Cascade Schedule\n`,
            `| Day | Time | Format | Title | Action |`,
            `| :-- | :--- | :----- | :---- | :----- |`
        ];

        let dayCounter = 1;
        const sortedDates = Array.from(dayMap.keys()).sort();

        for (const dateStr of sortedDates) {
            const chaps = dayMap.get(dateStr)!;
            const firstChapDate = new Date(chaps[0].scheduledDate || new Date());
            const dayOfWeek = firstChapDate.toLocaleDateString("en-US", { weekday: "long" });
            const dayDirName = `Day_${dayCounter.toString().padStart(2, '0')}_${dayOfWeek}`;
            const dayDir = path.join(productionRoot, dayDirName);
            await fs.mkdir(dayDir, { recursive: true });

            // Create Daily Direction
            const dailyDirection = `# Daily Direction: ${dayOfWeek}\n\n## Goal\nThis day focuses on transitioning the audience from **Doubt** to **Grounded Logic**.\n\n## Units\n` +
                chaps.map(c => `- **${c.title}** (${c.description})`).join('\n') +
                `\n\n## Manager Check\n- Verify tone is "Serious-Tier".\n- Check "Grounded Pivot" in each Copy Edit.`;
            await fs.writeFile(path.join(dayDir, "Daily_Direction.md"), dailyDirection);

            let unitCounter = 1;
            for (const chap of chaps) {
                const date = new Date(chap.scheduledDate || new Date());
                const timeStr = date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }).replace(/:/g, "");
                const format = (chap.title.toLowerCase().includes("thread") ? "THREAD" : "POST").toUpperCase();
                const safeTitle = chap.title.replace(/[^a-z0-9]/gi, "_").substring(0, 30);

                const unitDirName = `${timeStr}_Unit_${unitCounter.toString().padStart(2, '0')}_${format}_${safeTitle}`;
                const unitDir = path.join(dayDir, unitDirName);
                await fs.mkdir(unitDir, { recursive: true });

                // Read final content
                const contentPath = path.join(this.workingDir, chap.files[0] || "");
                const content = await readSafe(contentPath);

                // Read strategy
                const strategyPath = contentPath.replace("content.md", "concept.md");
                const strategy = await readSafe(strategyPath);

                // Export files for human review
                await fs.writeFile(path.join(unitDir, "01_Copy_Edit.md"), content);
                await fs.writeFile(path.join(unitDir, "02_Strategy_Context.md"), strategy);

                const schedule = {
                    day: dayOfWeek,
                    time: date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
                    iso: chap.scheduledDate,
                    title: chap.title,
                    format: format,
                    dayNumber: dayCounter,
                    unitNumber: unitCounter
                };
                await fs.writeFile(path.join(unitDir, "03_Publishing_Specs.json"), JSON.stringify(schedule, null, 2));

                const relativePath = `./02_Production_Ready/${dayDirName}/${unitDirName}`;
                dashboard.push(`| Day ${dayCounter} | ${schedule.time} | ${format} | ${chap.title} | [Review Copy](${relativePath}/01_Copy_Edit.md) |`);
                unitCounter++;
            }
            dayCounter++;
        }

        dashboard.push(`\n## 🛠️ Manager Instructions\n`);
        dashboard.push(`1. **Review Copy**: Open each \`01_Copy_Edit.md\` linked above.`);
        dashboard.push(`2. **Validate Grounding**: Ensure each post has 1 real-world constraint and 1 uncertainty (refer to \`02_Strategy_Context.md\`).`);
        dashboard.push(`3. **Schedule**: Use the \`03_Publishing_Specs.json\` for automated ingestion into scheduling tools.`);
        dashboard.push(`4. **Final Approval**: Move folders to your "Scheduled" queue once reviewed.`);

        await fs.writeFile(path.join(exportRoot, "README.md"), dashboard.join('\n'));

        return exportRoot;
    }
}
