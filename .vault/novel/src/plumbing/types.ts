// SKELETON PASS: Core type definitions for Chapter 1
// PLUMBING ZONE - architectural bones only

export interface ChapterMetadata {
  id: string;
  title: string;
  pass: PassNumber;
  status: ChapterStatus;
}

export type PassNumber = 1 | 2 | 3 | 4 | 5;
export type ChapterStatus =
  | "SKELETON"
  | "FLESH"
  | "VEINS"
  | "NERVES"
  | "HARDENED";

export interface Scene {
  id: SceneId;
  type: SceneType;
  content: SceneContent;
  markers: string[];
}

export type SceneId = `SCENE_${number}`;
export type SceneType =
  | "AWAKENING"
  | "DIALOGUE"
  | "CHOICE"
  | "ENCOUNTER"
  | "TRANSITION";

export interface SceneContent {
  narrative: string; // skeletal prose
  characters: CharacterId[];
  choices?: Choice[];
  asyncElements?: AsyncChoirElement[];
}

export interface Character {
  id: CharacterId;
  name: string;
  archetype: CharacterArchetype;
  firstAppearance: SceneId;
  typeSignature?: TypeSignature; // for Cardinal of Types
}

export type CharacterId = "PROTAGONIST" | "CARDINAL_OF_TYPES" | "ASYNC_CHOIR";
export type CharacterArchetype =
  | "CONSCIOUSNESS"
  | "CARDINAL"
  | "CHOIR"
  | "INTERFACE";

export interface Choice {
  id: ChoiceId;
  label: string;
  type: ChoiceType;
  consequences: Consequence[];
}

export type ChoiceId = "CHOICE_STRUCT" | "CHOICE_INTERFACE" | "CHOICE_UNION";
export type ChoiceType = "TYPE_SELECTION" | "PATH_DIVIDE" | "COMMITMENT";

export interface TypeSignature {
  name: string;
  constraints: string[];
  optionality: "required" | "optional" | "partial";
}

export interface AsyncChoirElement {
  voiceCount: number;
  harmonyType: "major" | "minor" | "dissonant" | "unresolved";
  promiseState: "pending" | "fulfilled" | "rejected";
}

export interface Consequence {
  triggers: string[];
  narrativeFlags: string[];
  typeImpact: "strict" | "loose" | "union";
}

// Cardinal-specific types
export interface CardinalOfTypes extends Character {
  archetype: "CARDINAL";
  domains: TypeDomain[];
  authorityLevel: number;
}

export type TypeDomain =
  | "PRIMITIVES"
  | "COMPOSITES"
  | "UNIONS"
  | "FUNCTIONS"
  | "GENERICS";

export interface VaultOfSyntax {
  architecture: "CATHEDRAL";
  location: "VAULT_OF_SYNTAX";
  features: ("PARSING_COLUMNS" | "ERROR_ALTARS" | "TYPE_GARDENS")[];
  ambientState: "REBOOTING" | "STABLE" | "COMPILING";
}
