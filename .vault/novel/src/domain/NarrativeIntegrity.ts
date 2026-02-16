// NERVE PASS: Narrative Integrity Domain Models
// Stress-testing the narrative structure and continuity

import { ChoirVoice } from "../plumbing/interfaces";

export interface NarrativeIntegrityCheck {
  id: string;
  chapterId: string;
  checkType: IntegrityCheckType;
  description: string;
  expectedResult: unknown;
  actualResult?: unknown;
  status: "PENDING" | "PASS" | "FAIL" | "CRITICAL";
  errorMessage?: string;
}

export type IntegrityCheckType =
  | "SCENE_CONTINUITY"
  | "CHARACTER_CONSISTENCY"
  | "CHOICE_VALIDATION"
  | "MARKER_COVERAGE"
  | "TYPE_SIGNATURE_COMPLIANCE"
  | "ASYNC_CHOIR_HARMONY"
  | "REBOOT_SEQUENCE_VALIDITY"
  | "VAULT_ARCHITECTURE_COHERENCE";

export interface IntegrityReport {
  chapterId: string;
  pass: "NERVE";
  timestamp: number;
  checks: NarrativeIntegrityCheck[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    critical: number;
  };
}

export interface SceneTransitionValidator {
  fromScene: string;
  toScene: string;
  requiredFlags: string[];
  forbiddenFlags: string[];
  temporalGapMs?: number;
  validate(): IntegrityCheck;
}

export interface CharacterArcValidator {
  characterId: string;
  appearances: string[];
  expectedDevelopment: string[];
  consistentTraits: Map<string, unknown>;
  validateDevelopment(): IntegrityCheck;
}

export interface ChoiceConsequence {
  triggers: string[];
  narrativeFlags: string[];
  typeImpact: "strict" | "loose" | "union";
}

export interface ChoiceConsequenceValidator {
  choiceId: string;
  consequences: ChoiceConsequence[];
  expectedNarrativeFlags: string[];
  typeImpact: "strict" | "loose" | "union";
  validateChoiceImpact(): IntegrityCheck;
}

export interface AsyncChoirValidator {
  voices: ChoirVoice[];
  expectedVoiceCount: number;
  harmonyPattern: string[];
  promiseStates: ("pending" | "fulfilled" | "rejected")[];
  validateHarmony(): IntegrityCheck;
}
