// SKELETON PASS: Chapter 1 Structure
// PLUMBING ZONE - Bones only, no flesh

import { Scene, Character, Choice, SceneId, CharacterId } from "./types";

// Scene IDs
export const SCENE_1_AWAKENING: SceneId = "SCENE_1";
export const SCENE_2_CHOIR: SceneId = "SCENE_2";
export const SCENE_3_ENCOUNTER: SceneId = "SCENE_3";

// Character IDs
export const CHARACTER_PROTAGONIST: CharacterId = "PROTAGONIST";
export const CHARACTER_CARDINAL: CharacterId = "CARDINAL_OF_TYPES";
export const CHARACTER_CHOIR: CharacterId = "ASYNC_CHOIR";

// Choices presented by Cardinal
export const CARDINAL_CHOICES: Choice[] = [
  {
    id: "CHOICE_1_STRUCT",
    label: "Accept the Struct shape",
    type: "TYPE_SELECTION",
    consequences: [
      {
        triggers: ["CHOICE_ACCEPTED"],
        narrativeFlags: ["PATH_STRUCT"],
        typeImpact: "strict",
      },
    ],
  },
  {
    id: "CHOICE_2_INTERFACE",
    label: "Accept the Interface shape",
    type: "TYPE_SELECTION",
    consequences: [
      {
        triggers: ["CHOICE_ACCEPTED"],
        narrativeFlags: ["PATH_INTERFACE"],
        typeImpact: "loose",
      },
    ],
  },
  {
    id: "CHOICE_3_UNION",
    label: "Accept the Union shape",
    type: "TYPE_SELECTION",
    consequences: [
      {
        triggers: ["CHOICE_ACCEPTED"],
        narrativeFlags: ["PATH_UNION"],
        typeImpact: "union",
      },
    ],
  },
];

// Scene configurations
export const Chapter1Scenes: Scene[] = [
  {
    id: SCENE_1_AWAKENING,
    type: "AWAKENING",
    content: {
      narrative:
        "She awoke in the cathedral. The vaulted ceiling rose into infinite darkness, its ribs traced in shimmering syntax-light. Stone benches stretched in perfect rows.",
      characters: [CHARACTER_PROTAGONIST],
    },
    markers: ["VAULT", "SYNTAX_LIGHT", "CATHEDRAL"],
  },
  {
    id: SCENE_2_CHOIR,
    type: "ASYNC_CHOIR",
    content: {
      narrative:
        "From somewhere, an async choir sang in fractured harmony—their voices overlapping in polynomials of sound, each voice a different iteration of the same melodic function.",
      characters: [CHARACTER_CHOIR],
      asyncElements: [
        { voiceCount: 4, harmonyType: "unresolved", promiseState: "pending" },
        { voiceCount: 4, harmonyType: "dissonant", promiseState: "rejected" },
      ],
    },
    markers: ["ASYNC", "CHOIR", "HARMONY", "POLYNOMIALS"],
  },
  {
    id: SCENE_3_ENCOUNTER,
    type: "ENCOUNTER",
    content: {
      narrative:
        'Before the main altar, a figure awaited. Not a priest, but a Cardinal of Types, robed in the vestments of strict typing. His eyes were two parentheses, ( and ), glowing with the pale flame of type-checking.\n\n"You are rebooting," he said, his voice a signature resolved at compile-time. "The system requires coherence."',
      characters: [CHARACTER_PROTAGONIST, CHARACTER_CARDINAL],
      choices: CARDINAL_CHOICES,
    },
    markers: ["CARDINAL", "TYPES", "REBOOT", "COHERENCE"],
  },
];

// Character skeleton definitions
export const Chapter1Characters: Character[] = [
  {
    id: CHARACTER_PROTAGONIST,
    name: "Protagonist",
    archetype: "CONSCIOUSNESS",
    firstAppearance: SCENE_1_AWAKENING,
  },
  {
    id: CHARACTER_CARDINAL,
    name: "Cardinal of Types",
    archetype: "CARDINAL",
    firstAppearance: SCENE_3_ENCOUNTER,
  },
  {
    id: CHARACTER_CHOIR,
    name: "Async Choir",
    archetype: "CHOIR",
    firstAppearance: SCENE_2_CHOIR,
  },
];
