export type AscensionTechnique =
  | "EXECUTE"
  | "RESEARCH"
  | "DEBUG"
  | "PANIC"
  | "HYPE"
  | "LIMIT_BREAK";
export type SpiritMood =
  | "AGGRESSIVE"
  | "CAUTIOUS"
  | "INQUISITIVE"
  | "ZEN"
  | "EUPHORIA"
  | "DOUBT"
  | "FRICTION"
  | "STABLE"
  | "FLUIDITY"
  | "HESITATION";
export type SpiritUrgency = "LOW" | "MEDIUM" | "HIGH";
export type AscensionStopCondition = "landed" | "structural_uncertainty" | "continuation_required";

export type GhostwriterMode =
  | "EXPAND"
  | "REFINE"
  | "HARDEN"
  | "REPAIR"
  | "COMPRESS"
  | "PULSE"
  | "VOICE"
  | "SOW"
  | "SUBTEXT"
  | "ECHO"
  | "INTIMACY"
  | "VISCERAL"
  | "ARCHEOLOGY"
  | "REFRACT"
  | "DILATE"
  | "SYNESTHESIA"
  | "MERGE";

export interface ChronoPerception {
  dilationFactor: number; // 1.0 is normal, >1 is slow, <1 is fast
  tempo: "FROZEN" | "STRETCHED" | "FLUID" | "BLURRED";
  anchorEvent?: string; // Event causing the dilation
}

export interface SynestheticMap {
  sourceSense: "SIGHT" | "SOUND" | "SMELL" | "TOUCH" | "TASTE";
  targetSense: "SIGHT" | "SOUND" | "SMELL" | "TOUCH" | "TASTE";
  intensity: number; // 0-1
}

export interface SemanticVector {
  thesisAlignment: number; // 0-1
  driftDetected: boolean;
  coreKeywords: string[];
}
export interface SomaticState {
  pulse: number; // BPM or relative 0-1
  breath: "STEADY" | "STACCATO" | "SHALLOW" | "HEAVY";
  tension: number; // 0-1
}

export interface EpistemicLayer {
  objectPath: string;
  history: string;
  lexiconTags: string[]; // nautical, medical, etc.
}

export interface PerceptualBias {
  name: string;
  intensity: number; // 0-1
  distortionRule: string; // e.g., "See beauty as rot"
}
export interface InteriorityProfile {
  velocity: number; // 0-1 (Internal thought speed/density)
  vulnerability: number; // 0-1 (Emotional openness)
  focus: "EXTERNAL" | "INTERNAL" | "RESONANT";
}

export interface RelationshipPoint {
  intimacy: number; // 0-1
  tension: number; // 0-1
  bondType: string;
}

export interface ResearchSeed {
  id: string;
  data: string;
  source?: string;
  woven: boolean;
}

export interface Motif {
  symbol: string;
  meaning: string;
  owner?: string; // Character or Theme it belongs to
}

export interface CharacterProfile {
  name: string;
  archetype: string; // e.g., "The Technomancer"
  voice: string; // e.g., "Cynical, precise"
  traits: string[];
  motivation: string;
  status: string;
  povActive: boolean;
  interiority?: InteriorityProfile;
  somatic?: SomaticState;
  biases: PerceptualBias[];
  motifs: string[];
  psychicState?: {
    chrono?: ChronoPerception;
    synesthesia?: SynestheticMap[];
  };
}

export interface WorldLexicon {
  terms: Record<string, string>;
  laws: string[];
  geography: string[];
}

export type NarrativeZone = "CORE_ARGUMENT" | "SUPPORT" | "PLUMBING" | "THEMATIC" | "NARRATIVE" | "SENSORY";

export interface SectionBoundary {
  heading: string;
  startLine: number;
  endLine: number;
  zone: NarrativeZone;
}

export interface GhostwriterMemory {
  thesisClaims: string[];
  definedVariables: string[];
  sectionBoundaries: SectionBoundary[];
  downgradedHypotheses: string[];
  characterBible?: CharacterProfile[];
  worldLexicon?: WorldLexicon;
  activePOV?: string;
  proximityMatrix?: Record<string, Record<string, RelationshipPoint>>;
  motifLibrary?: Motif[];
  researchSeeds?: ResearchSeed[];
  currentSceneSubtext?: string;
  archeologicalAnchors?: EpistemicLayer[];
  currentEnvironment?: string;
  semanticFidelityScore?: number;
  semanticVector?: SemanticVector;
}

export interface TechniqueExecution {
  name: string;
  durationMs: number;
  success: boolean;
  timestamp: number;
  filePath?: string;
}

export interface AscensionDecree {
  strategy: AscensionTechnique;
  urgency: SpiritUrgency;
  confidence: number;
  isContinueDirective: boolean;
  structuralUncertainty: boolean;
  reason: string;
  requiredActions: string[];
  blockedBy: string[];
  stopCondition: AscensionStopCondition;
  heroicVow?: string;
  vowLockMs?: number;
  sacrificeTriggered?: boolean;
  profile: "demo_day" | "balanced" | "recovery";
  ghostwriterMode?: GhostwriterMode;
  raw: string;
}

export interface AscensionState {
  lastActiveFile?: string;
  errorHotspots: Record<string, number>;
  totalErrorCount: number;
  spiritPressure: number; // Formerly flowState, 0-100
  recentFiles: string[];
  toolHistory: string[];
  techniqueExecutions: TechniqueExecution[];
  victoryStreak: number;
  shakyResponseDensity: number;
  writtenFiles: string[];
  actionDiffs: Record<string, string>;
  wiringAlerts: string[];
  lastDecree?: AscensionDecree;
  mood: SpiritMood;
  isSpiritBurstActive: boolean;
  isAwakened: boolean;
  karmaBond?: string;
  panicCoolDown: number;
  environment: "cli" | "vscode" | "unknown";
  lastFailedFile?: string;
  ghostwriterMemory?: GhostwriterMemory;
}
