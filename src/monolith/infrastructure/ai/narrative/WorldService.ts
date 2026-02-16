
import * as fs from "fs/promises";
import * as path from "path";
import { WorldBible, WorldEntity, WorldEvent, WorldRelationship } from "../../../domain/WorldBible.js";
import { CharacterSimulator } from "../../../domain/CharacterSimulator.js";

interface ContextNode {
    entity: WorldEntity;
    relevance: number;
    reason: string;
}

export class WorldService {
    private static readonly WORLD_FILE = ".marie/world_bible.json";
    private bible: WorldBible = {
        name: "New World",
        overview: "A newly birthed world.",
        entities: [],
        timeline: [],
        constraints: [],
        currentDate: { year: 1, month: 1, day: 1, hour: 8 },
        calendar: {
            yearLength: 12,
            monthLength: 30,
            dayLength: 24,
            seasons: ["Spring", "Summer", "Autumn", "Winter"]
        }
    };

    constructor(private rootPath: string) { }

    // ─── LIFECYCLE ─────────────────────────────────────────────────────────

    public async initialize() {
        try {
            const data = await fs.readFile(
                path.join(this.rootPath, WorldService.WORLD_FILE),
                "utf-8",
            );
            this.bible = JSON.parse(data);
        } catch (e) {
            await this.save();
        }
    }

    public async save() {
        await fs.mkdir(path.join(this.rootPath, ".marie"), { recursive: true });
        await fs.writeFile(
            path.join(this.rootPath, WorldService.WORLD_FILE),
            JSON.stringify(this.bible, null, 2),
        );
    }

    public getBible(): WorldBible {
        return this.bible;
    }

    // ─── ENTITY MANAGEMENT ─────────────────────────────────────────────────

    public async addEntity(entity: WorldEntity) {
        const existingIndex = this.bible.entities.findIndex((e) => e.id === entity.id);
        if (existingIndex >= 0) {
            this.bible.entities[existingIndex] = entity;
        } else {
            this.bible.entities.push(entity);
        }
        await this.save();
    }

    public async updateRelationship(sourceId: string, targetId: string, type: string, description: string) {
        const source = this.bible.entities.find(e => e.id === sourceId);
        const target = this.bible.entities.find(e => e.id === targetId);

        if (!source) {
            console.warn(`Cannot update relationship: Source Entity ${sourceId} not found.`);
            return;
        }

        // We allow targeting a missing ID to support consistency checking of "broken links" later
        // or out-of-order loading.

        // Update Source -> Target
        const existingRelIndex = source.relationships.findIndex(r => r.targetId === targetId);
        if (existingRelIndex >= 0) {
            source.relationships[existingRelIndex] = { targetId, type, description };
        } else {
            source.relationships.push({ targetId, type, description });
        }

        // Ideally, we might want inverse relationships, but for now we keep it directed.
        await this.save();
    }

    public async addEvent(event: WorldEvent) {
        this.bible.timeline.push(event);
        // Sort timeline by date if flexible date parsing allows, otherwise append
        await this.save();
    }

    public async applyWorldDelta(delta: any) {
        if (delta.newEntities) {
            for (const entity of delta.newEntities) {
                await this.addEntity(entity);
            }
        }

        if (delta.updatedEntities) {
            for (const update of delta.updatedEntities) {
                const entity = this.bible.entities.find(e => e.id === update.id);
                if (entity) {
                    Object.assign(entity, update);
                }
            }
        }

        if (delta.relationshipChanges) {
            for (const rel of delta.relationshipChanges) {
                await this.updateRelationship(rel.sourceId, rel.targetId, rel.newType, rel.description);
            }
        }

        if (delta.newEvents) {
            for (const event of delta.newEvents) {
                this.bible.timeline.push(event);
            }
        }

        await this.save();
    }

    // ─── CONTEXT & CONSISTENCY ─────────────────────────────────────────────

    /**
     * Advanced Context Retrieval using Graph Traversal.
     * 1. Identify Direct Matches (Entities mentioned in input/keywords)
     * 2. Traverse 1st Degree connections (Relationships)
     * 3. Rank by relevance
     */
    public getWorldContext(keywords: string[] = []): string {
        const relevantNodes = new Map<string, ContextNode>();

        // 1. Direct Matches
        for (const entity of this.bible.entities) {
            // Simplified keyword matching
            const isMatch = keywords.some(k =>
                entity.name.toLowerCase().includes(k.toLowerCase()) ||
                entity.tags.some(t => t.toLowerCase() === k.toLowerCase())
            );

            if (isMatch) {
                relevantNodes.set(entity.id, { entity, relevance: 1.0, reason: "Direct Match" });
            }
        }

        // 2. Traversal (1st Degree)
        const directMatches = Array.from(relevantNodes.values());
        for (const node of directMatches) {
            for (const rel of node.entity.relationships) {
                if (!relevantNodes.has(rel.targetId)) {
                    const target = this.bible.entities.find(e => e.id === rel.targetId);
                    if (target) {
                        relevantNodes.set(target.id, {
                            entity: target,
                            relevance: 0.5,
                            reason: `Linked to ${node.entity.name} (${rel.type})`
                        });
                    }
                }
            }
        }

        // If no keywords provided or no matches, fallback to "Key Entities" (VIPs)
        if (relevantNodes.size === 0) {
            this.bible.entities.slice(0, 5).forEach(e =>
                relevantNodes.set(e.id, { entity: e, relevance: 0.1, reason: "Default Context" })
            );
        }

        // Format Output
        let context = `[WORLD BIBLE: ${this.bible.name}]\n`;
        context += `OVERVIEW: ${this.bible.overview}\n`;

        if (this.bible.currentDate) {
            context += `CURRENT DATE: Year ${this.bible.currentDate.year}, Month ${this.bible.currentDate.month}, Day ${this.bible.currentDate.day}\n`;
            context += `SEASON: ${this.getCurrentSeason()}\n`;
        }
        context += `\n`;

        // Inject Active Factions for Simulation Mode
        const factions = this.bible.entities.filter(e => e.type === "FACTION" || (e.goals && e.goals.length > 0));
        if (factions.length > 0) {
            context += `[ACTIVE FACTIONS & GOALS]\n`;
            factions.forEach(f => {
                context += `### ${f.name} (${f.state || "Active"})\n`;
                if (f.goals) context += `   - Goals: ${f.goals.join(", ")}\n`;
                if (f.resources) context += `   - Resources: ${f.resources.join(", ")}\n`;
                context += `\n`;
            });
        }

        context += `[RELEVANT ENTITIES]\n`;
        const sorted = Array.from(relevantNodes.values()).sort((a, b) => b.relevance - a.relevance);

        for (const node of sorted) {
            context += `### ${node.entity.name} (${node.entity.type})\n`;
            context += `   - Description: ${node.entity.description}\n`;
            if (Object.keys(node.entity.attributes).length > 0) {
                context += `   - Attributes: ${JSON.stringify(node.entity.attributes)}\n`;
            }
            if (node.entity.relationships.length > 0) {
                context += `   - Relationships:\n`;
                node.entity.relationships.forEach(r => {
                    const targetName = this.bible.entities.find(e => e.id === r.targetId)?.name || r.targetId;
                    context += `     * ${r.type} -> ${targetName}: ${r.description || ""}\n`;
                });
            }
            if (node.entity.voiceProfile) {
                const v = node.entity.voiceProfile;
                context += `   - VOICE PROFILE: ${v.tone} | Vocab: ${v.vocabulary}\n`;
                context += `   - CATCHPHRASES: "${v.catchphrases.join('", "')}"\n`;
            }
            context += `\n`;
        }

        context += `[GLOBAL CONSTRAINTS]\n`;
        this.bible.constraints.forEach(c => {
            context += `- [${c.category}] ${c.rule}\n`;
        });

        return context;
    }

    // ─── TIME & PHYSICS ────────────────────────────────────────────────────

    public async advanceTime(days: number) {
        if (!this.bible.currentDate || !this.bible.calendar) return;

        let { year, month, day, hour } = this.bible.currentDate;
        const { yearLength, monthLength } = this.bible.calendar;

        day += days;
        while (day > monthLength) {
            day -= monthLength;
            month++;
        }
        while (month > yearLength) {
            month -= yearLength;
            year++;
        }

        this.bible.currentDate = { year, month, day, hour };

        // SIMULATION STEP
        // Iterate through active characters (that are not the Player/Hero if we want to simulate player differently, 
        // but for now simulate everyone to update their states)
        for (const entity of this.bible.entities) {
            if (entity.type === "CHARACTER" || entity.type === "FACTION") {
                const turn = CharacterSimulator.simulateTurn(entity, this.bible);
                if (turn.action !== "Idle" && turn.action !== "Decay") {
                    // Log significant actions to timeline or just console for now
                    // In a real system, we'd add a "World Event" if the action was big enough.
                    if (Math.random() > 0.8) { // Only log interesting things
                        this.addEvent({
                            id: `evt_${Date.now()}_${entity.id}`,
                            name: `${entity.name} ${turn.action}`,
                            date: `${year}-${month}-${day}`,
                            description: turn.result,
                            participants: [entity.id, turn.targetId || ""]
                        });
                    }
                }
            }
        }

        await this.save();
    }

    public getCurrentSeason(): string {
        if (!this.bible.currentDate || !this.bible.calendar) return "Unknown";
        const { month } = this.bible.currentDate;
        const seasons = this.bible.calendar.seasons;
        // Simple mapping: evenly divide months by seasons
        const seasonIndex = Math.floor((month - 1) / (this.bible.calendar.yearLength / seasons.length));
        return seasons[seasonIndex % seasons.length];
    }

    public getWeather(latitude: "TEMPERATE" | "TROPICAL" | "ARID" | "FRIGID" = "TEMPERATE"): string {
        const season = this.getCurrentSeason();
        const base = Math.random();

        if (latitude === "FRIGID") {
            if (season === "Winter") return base > 0.3 ? "Blizzard" : "Light Snow";
            return base > 0.5 ? "Cold Wind" : "Clear Skies";
        }
        if (latitude === "ARID") {
            return base > 0.9 ? "Sandstorm" : "Scorching Sun";
        }
        if (season === "Winter") return base > 0.5 ? "Snow" : "Cloudy";
        if (season === "Summer") return base > 0.8 ? "Thunderstorm" : "Sunny";
        return base > 0.7 ? "Rain" : "Partly Cloudy";
    }

    public getTravelTime(sourceId: string, targetId: string): number {
        const s = this.bible.entities.find(e => e.id === sourceId);
        const t = this.bible.entities.find(e => e.id === targetId);
        if (!s?.coordinates || !t?.coordinates) return 1; // Default 1 day

        const dist = Math.sqrt(Math.pow(t.coordinates.x - s.coordinates.x, 2) + Math.pow(t.coordinates.y - s.coordinates.y, 2));
        // Assume 20 units per day travel speed
        return Math.ceil(dist / 20);
    }

    public async validateConsistency(text: string): Promise<string[]> {
        const issues: string[] = [];

        // 1. Entity Existence & Spaghetti Check
        // Check if referenced entities exist
        // (This is hard to do without NLP entity extraction, so we reverse it)
        // We check if known entities are used in ways that contradict their static data?

        // For this version, we'll check RELATIONSHIP INTEGRITY
        for (const entity of this.bible.entities) {
            for (const rel of entity.relationships) {
                const target = this.bible.entities.find(e => e.id === rel.targetId);
                if (!target) {
                    issues.push(`Broken Link: ${entity.name} references non-existent ID ${rel.targetId}`);
                }
            }
        }

        // 2. Timeline Paradox Check (Simple)
        // If we had dates, we'd check if events happen in order.

        return issues;
    }
}
