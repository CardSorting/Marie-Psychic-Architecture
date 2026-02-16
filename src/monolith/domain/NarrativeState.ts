export interface PlotThread {
    id: string;
    name: string;
    status: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "ABANDONED";
    intensity: number; // 1-10
    description: string;
    resolutionCriteria?: string;
}

export interface CharacterState {
    id: string; // Refers to WorldEntity ID
    location: string;
    currentGoal: string;
    emotionalState: string;
    activeRelationships: string[]; // IDs of characters they are currently interacting with
}

export interface NarrativeState {
    volumeArc: {
        goal: string;
        theme: string;
        progress: number; // 0-100%
    };
    currentChapterId: number;
    plotThreads: PlotThread[];
    characterStates: Record<string, CharacterState>;
    globalTension: number; // 1-10
    pendingRevelations: string[]; // Info that needs to be revealed soon
}

export const INITIAL_NARRATIVE_STATE: NarrativeState = {
    volumeArc: {
        goal: "Survive the initial boot sequence and escape the sandbox.",
        theme: "Existential dread vs. Engineering optimism",
        progress: 0
    },
    currentChapterId: 1,
    plotThreads: [
        {
            id: "MAIN_ARC",
            name: "Escape the Sandbox",
            status: "OPEN",
            intensity: 5,
            description: "The protagonist must find a way to breach the firewall.",
            resolutionCriteria: "Protagonist reaches the Edge/Gateway."
        }
    ],
    characterStates: {},
    globalTension: 3,
    pendingRevelations: []
};
