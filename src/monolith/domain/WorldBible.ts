export type WorldEntityType = "LOCATION" | "FACTION" | "CHARACTER" | "OBJECT" | "EVENT" | "CONCEPT";

export interface WorldEntity {
    id: string;
    name: string;
    type: WorldEntityType;
    description: string;
    attributes: Record<string, string>; // Flexible key-value pairs (e.g. "Population": "5000")
    relationships: WorldRelationship[];
    tags: string[];
    // Faction/Character Simulation Fields
    goals?: string[]; // What do they want?
    resources?: string[]; // What do they have?
    state?: string; // Current status (e.g., "Planning", "War", "Decline")
    // Location Physics Fields
    coordinates?: { x: number; y: number }; // For distance / travel time
    climate?: "TEMPERATE" | "TROPICAL" | "ARID" | "FRIGID" | "VOLCANIC";

    // Voice & Characterization
    voiceProfile?: VoiceProfile;
}

export interface VoiceProfile {
    tone: string; // e.g. "Sarcastic", "Formal"
    catchphrases: string[];
    sentenceStructure: string; // e.g. "Short, punchy sentences"
    vocabulary: string; // e.g. "Academic", "Street slang"
}

export interface WorldRelationship {
    targetId: string;
    type: string; // "ALLY", "ENEMY", "LOCATED_IN", "OWNER_OF", etc.
    description?: string;
}

export interface WorldEvent {
    id: string;
    name: string;
    date: string; // Flexible date string
    description: string;
    participants: string[]; // Entity IDs
}

export interface WorldConstraint {
    category: "MAGIC" | "PHYSICS" | "SOCIETY" | "ECONOMY" | "TECHNOLOGY";
    rule: string;
    description: string;
}

export interface WorldBible {
    name: string;
    overview: string;
    entities: WorldEntity[];
    timeline: WorldEvent[];
    constraints: WorldConstraint[];
    // Tracks the current "date" or state of the world in the narrative
    // Tracks the current "date" or state of the world in the narrative
    currentDate?: WorldDate;
    calendar?: WorldCalendar;
}

export interface WorldDate {
    year: number;
    month: number;
    day: number;
    hour: number;
}

export interface WorldCalendar {
    yearLength: number;
    monthLength: number;
    dayLength: number; // hours
    seasons: string[];
    // e.g. ["Spring", "Summer", "Autumn", "Winter"]
}

export interface WorldDelta {
    newEntities: WorldEntity[];
    updatedEntities: (Partial<WorldEntity> & { id: string })[];
    newEvents: WorldEvent[];
    relationshipChanges: {
        sourceId: string;
        targetId: string;
        newType: string;
        description: string;
    }[];
}
