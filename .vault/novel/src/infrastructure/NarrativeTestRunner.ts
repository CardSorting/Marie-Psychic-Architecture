// NERVE PASS: Test Runner for Chapter 1 Stress Tests
// Executes all integrity validations and reports results

import {
  IntegrityReport,
  NarrativeIntegrityCheck,
  IntegrityCheckType,
  SceneTransitionValidator,
  CharacterArcValidator,
  ChoiceConsequenceValidator,
  AsyncChoirValidator,
} from "../domain/NarrativeIntegrity";
import {
  Chapter1Scenes,
  SCENE_1_AWAKENING,
  SCENE_2_CHOIR,
  SCENE_3_ENCOUNTER,
  CARDINAL_CHOICES,
  Chapter1Characters,
} from "../plumbing/Chapter_1_skeleton";

export class Chapter1NerveTestRunner {
  private report: IntegrityReport;

  constructor() {
    this.report = {
      chapterId: "Chapter_1_Reboot_in_the_Vault_of_Syntax",
      pass: "NERVE",
      timestamp: Date.now(),
      checks: [],
      summary: { total: 0, passed: 0, failed: 0, critical: 0 },
    };
  }

  async runAllTests(): Promise<IntegrityReport> {
    // Run all stress tests
    this.validateSceneContinuity();
    this.validateCharacterConsistency();
    this.validateChoiceConsequences();
    this.validateAsyncChoirHarmony();
    this.validateMarkerCoverage();
    this.validateRebootSequence();

    this.calculateSummary();
    return this.report;
  }

  private validateSceneContinuity(): void {
    const checkType: IntegrityCheckType = "SCENE_CONTINUITY";
    const check: NarrativeIntegrityCheck = {
      id: "SCENE_CONTINUITY_001",
      chapterId: this.report.chapterId,
      checkType,
      description: "Ensure scenes follow logical order without gaps",
      expectedResult: [SCENE_1_AWAKENING, SCENE_2_CHOIR, SCENE_3_ENCOUNTER],
      actualResult: Chapter1Scenes.map((s) => s.id),
      status: "PENDING",
    };

    const expected = [SCENE_1_AWAKENING, SCENE_2_CHOIR, SCENE_3_ENCOUNTER];
    const actual = Chapter1Scenes.map((s) => s.id);

    if (JSON.stringify(expected) === JSON.stringify(actual)) {
      check.status = "PASS";
      check.actualResult = actual;
    } else {
      check.status = "FAIL";
      check.errorMessage = `Scene order mismatch. Expected ${expected.join(", ")}, got ${actual.join(", ")}`;
    }

    this.report.checks.push(check);
  }

  private validateCharacterConsistency(): void {
    const checkType: IntegrityCheckType = "CHARACTER_CONSISTENCY";
    const check: NarrativeIntegrityCheck = {
      id: "CHARACTER_CONSISTENCY_001",
      chapterId: this.report.chapterId,
      checkType,
      description: "All characters appear in their designated first scenes",
      expectedResult:
        "Protagonist in SCENE_1, Cardinal in SCENE_3, Choir in SCENE_2",
      actualResult: undefined,
      status: "PENDING",
    };

    const actual = [];
    for (const char of Chapter1Characters) {
      const firstScene = char.firstAppearance;
      const scene = Chapter1Scenes.find((s) => s.id === firstScene);
      if (scene) {
        const appears = scene.characters.includes(char.id);
        actual.push(`${char.id} appears in ${firstScene}: ${appears}`);
      } else {
        actual.push(`${char.id} firstAppearance ${firstScene} not found`);
      }
    }

    const expected = [
      "PROTAGONIST appears in SCENE_1: true",
      "CARDINAL_OF_TYPES appears in SCENE_3: true",
      "ASYNC_CHOIR appears in SCENE_2: true",
    ];

    if (JSON.stringify(expected) === JSON.stringify(actual)) {
      check.status = "PASS";
      check.actualResult = actual;
    } else {
      check.status = "FAIL";
      check.errorMessage = `Character consistency check failed: ${JSON.stringify(actual)}`;
    }

    this.report.checks.push(check);
  }

  private validateChoiceConsequences(): void {
    const checkType: IntegrityCheckType = "CHOICE_VALIDATION";
    const check: NarrativeIntegrityCheck = {
      id: "CHOICE_VALIDATION_001",
      chapterId: this.report.chapterId,
      checkType,
      description:
        "All choices have non-empty consequences with required fields",
      expectedResult:
        "Each choice has at least one consequence with triggers and narrativeFlags",
      actualResult: undefined,
      status: "PENDING",
    };

    const actual: string[] = [];
    let allValid = true;

    for (const choice of CARDINAL_CHOICES) {
      if (!choice.consequences || choice.consequences.length === 0) {
        allValid = false;
        actual.push(`Choice ${choice.id} has no consequences`);
        continue;
      }

      for (const cons of choice.consequences) {
        if (!cons.triggers || cons.triggers.length === 0) {
          allValid = false;
          actual.push(`Choice ${choice.id} consequence missing triggers`);
        }
        if (!cons.narrativeFlags || cons.narrativeFlags.length === 0) {
          allValid = false;
          actual.push(`Choice ${choice.id} consequence missing narrativeFlags`);
        }
      }
    }

    check.status = allValid ? "PASS" : "FAIL";
    check.actualResult = allValid
      ? "All choices have valid consequences"
      : actual;

    this.report.checks.push(check);
  }

  private validateAsyncChoirHarmony(): void {
    const checkType: IntegrityCheckType = "ASYNC_CHOIR_HARMONY";
    const check: NarrativeIntegrityCheck = {
      id: "ASYNC_CHOIR_HARMONY_001",
      chapterId: this.report.chapterId,
      checkType,
      description:
        "Scene 2 contains async choir elements with valid voice configurations",
      expectedResult:
        "asyncElements array exists with at least one entry having voiceCount, harmonyType, promiseState",
      actualResult: undefined,
      status: "PENDING",
    };

    const scene = Chapter1Scenes.find((s) => s.id === SCENE_2_CHOIR);
    const asyncElements = scene?.asyncElements;

    if (!asyncElements || asyncElements.length === 0) {
      check.status = "FAIL";
      check.errorMessage = "Scene 2 has no asyncElements defined";
    } else {
      const valid = asyncElements.every(
        (el) =>
          typeof el.voiceCount === "number" &&
          el.harmonyType &&
          el.promiseState,
      );
      check.status = valid ? "PASS" : "FAIL";
      check.actualResult = `Found ${asyncElements.length} async element(s)`;
      if (!valid) {
        check.errorMessage =
          "One or more asyncElements missing required fields";
      }
    }

    this.report.checks.push(check);
  }

  private validateMarkerCoverage(): void {
    const checkType: IntegrityCheckType = "MARKER_COVERAGE";
    const check: NarrativeIntegrityCheck = {
      id: "MARKER_COVERAGE_001",
      chapterId: this.report.chapterId,
      checkType,
      description: "All scenes have at least one marker for indexing",
      expectedResult: "Every scene.markers array non-empty",
      actualResult: undefined,
      status: "PENDING",
    };

    const allHaveMarkers = Chapter1Scenes.every(
      (s) => s.markers && s.markers.length > 0,
    );
    check.status = allHaveMarkers ? "PASS" : "FAIL";
    check.actualResult = Chapter1Scenes.map(
      (s) => `${s.id}: [${s.markers?.join(", ")}]`,
    ).join("; ");

    this.report.checks.push(check);
  }

  private validateRebootSequence(): void {
    const checkType: IntegrityCheckType = "REBOOT_SEQUENCE_VALIDITY";
    NarrativeIntegrityCheck = {
      id: "REBOOT_SEQUENCE_001",
      chapterId: this.report.chapterId,
      checkType,
      description:
        "First scene is AWAKENING type and contains narrative about waking/rebooting",
      expectedResult:
        "Scene 1 is AWAKENING with narrative containing 'awoke' or 'reboot'",
      actualResult: undefined,
      status: "PENDING",
    };

    const scene = Chapter1Scenes.find((s) => s.id === SCENE_1_AWAKENING);
    if (!scene) {
      check.status = "FAIL";
      check.errorMessage = "Scene 1 not found";
    } else if (scene.type !== "AWAKENING") {
      check.status = "FAIL";
      check.errorMessage = `Scene 1 type is ${scene.type}, expected AWAKENING`;
    } else {
      const narrative = scene.content.narrative.toLowerCase();
      const hasRebootKeyword =
        narrative.includes("awake") ||
        narrative.includes("reboot") ||
        narrative.includes("woke");
      check.status = hasRebootKeyword ? "PASS" : "FAIL";
      check.actualResult = `Narrative contains reboot/awake: ${hasRebootKeyword}`;
    }

    this.report.checks.push(check);
  }

  private calculateSummary(): void {
    const total = this.report.checks.length;
    let passed = 0,
      failed = 0,
      critical = 0;
    for (const c of this.report.checks) {
      if (c.status === "PASS") passed++;
      else if (c.status === "FAIL") failed++;
      else if (c.status === "CRITICAL") critical++;
    }
    this.report.summary = { total, passed, failed, critical };
  }
}

// Export singleton runner
export const nerveTestRunner = new Chapter1NerveTestRunner();
