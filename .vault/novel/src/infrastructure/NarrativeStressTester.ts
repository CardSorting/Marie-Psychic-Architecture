// NERVE PASS: Narrative Stress Testing Infrastructure
// Validates edge cases, error handling, and systemic resilience

import {
  NarrativeIntegrityCheck,
  IntegrityReport,
  SceneTransitionValidator,
  CharacterArcValidator,
  ChoiceConsequenceValidator,
  AsyncChoirValidator,
} from "../domain/NarrativeIntegrity";
import {
  Chapter1Scenes,
  Chapter1Characters,
  CARDINAL_CHOICES,
  SCENE_1_AWAKENING,
  SCENE_2_CHOIR,
  SCENE_3_ENCOUNTER,
} from "../plumbing/Chapter_1_skeleton";

export class NarrativeStressTester {
  private checks: NarrativeIntegrityCheck[] = [];
  private chapterId = "Chapter_1_Reboot_in_the_Vault_of_Syntax";

  async runFullStressTest(): Promise<IntegrityReport> {
    this.checks = [];

    // Scene continuity validation
    await this.validateSceneTransitions();

    // Character consistency validation
    await this.validateCharacterArcs();

    // Choice impact validation
    await this.validateChoiceConsequences();

    // Async choir harmonic integrity
    await this.validateAsyncChoirHarmony();

    // Marker coverage validation
    await this.validateMarkerCoverage();

    // Vault architecture coherence
    await this.validateVaultArchitecture();

    // Reboot sequence validity
    await this.validateRebootSequence();

    return this.generateReport();
  }

  private async validateSceneTransitions(): Promise<void> {
    const validator = new SceneTransitionValidator(
      SCENE_1_AWAKENING,
      SCENE_2_CHOIR,
      ["VAULT", "SYNTAX_LIGHT"],
      [],
    );
    const check = validator.validate();
    this.checks.push(check);
  }

  private async validateCharacterArcs(): Promise<void> {
    for (const character of Chapter1Characters) {
      const validator = new CharacterArcValidator(
        character.id,
        [character.firstAppearance],
        this.expectedDevelopmentFor(character.id),
        new Map<string, unknown>(),
      );
      const check = validator.validateDevelopment();
      this.checks.push(check);
    }
  }

  private async validateChoiceConsequences(): Promise<void> {
    for (const choice of CARDINAL_CHOICES) {
      const validator = new ChoiceConsequenceValidator(
        choice.id,
        choice.consequences,
        ["PATH_STRUCT", "PATH_INTERFACE", "PATH_UNION"],
        choice.consequences[0].typeImpact,
      );
      const check = validator.validateChoiceImpact();
      this.checks.push(check);
    }
  }

  private async validateAsyncChoirHarmony(): Promise<void> {
    const scene = Chapter1Scenes.find((s) => s.id === SCENE_2_CHOIR);
    const asyncElements = scene?.content.asyncElements || [];

    const validator = new AsyncChoirValidator(
      [], // voices would be populated from runtime data
      asyncElements.length,
      asyncElements.map((e) => e.harmonyType),
      asyncElements.map((e) => e.promiseState),
    );
    const check = validator.validateHarmony();
    this.checks.push(check);
  }

  private async validateMarkerCoverage(): Promise<void> {
    const allMarkers = Chapter1Scenes.flatMap((s) => s.markers);
    const requiredMarkers = [
      "VAULT",
      "SYNTAX_LIGHT",
      "CATHEDRAL",
      "ASYNC",
      "CHOIR",
      "CARDINAL",
      "TYPES",
    ];

    for (const required of requiredMarkers) {
      const check: NarrativeIntegrityCheck = {
        id: `MARKER_COVERAGE_${required}`,
        chapterId: this.chapterId,
        checkType: "MARKER_COVERAGE",
        description: `Required marker '${required}' must be present in chapter`,
        expectedResult: true,
        actualResult: allMarkers.includes(required),
        status: allMarkers.includes(required) ? "PASS" : "FAIL",
      };
      this.checks.push(check);
    }
  }

  private async validateVaultArchitecture(): Promise<void> {
    const awakeningScene = Chapter1Scenes.find(
      (s) => s.id === SCENE_1_AWAKENING,
    );
    const hasVault = awakeningScene?.markers.includes("VAULT") ?? false;
    const hasSyntax = awakeningScene?.markers.includes("SYNTAX_LIGHT") ?? false;

    const check: NarrativeIntegrityCheck = {
      id: "VAULT_ARCH_COHERENCE",
      chapterId: this.chapterId,
      checkType: "VAULT_ARCHITECTURE_COHERENCE",
      description:
        "Awakening scene must contain both vault and syntax-light elements",
      expectedResult: true,
      actualResult: hasVault && hasSyntax,
      status: hasVault && hasSyntax ? "PASS" : "FAIL",
    };
    this.checks.push(check);
  }

  private async validateRebootSequence(): Promise<void> {
    const encounterScene = Chapter1Scenes.find(
      (s) => s.id === SCENE_3_ENCOUNTER,
    );
    const mentionsReboot =
      encounterScene?.content.narrative.includes("rebooting") ||
      encounterScene?.content.narrative.includes("Reboot");

    const check: NarrativeIntegrityCheck = {
      id: "REBOOT_SEQUENCE_VALIDITY",
      chapterId: this.chapterId,
      checkType: "REBOOT_SEQUENCE_VALIDITY",
      description: "Encounter scene must establish the reboot context",
      expectedResult: true,
      actualResult: mentionsReboot,
      status: mentionsReboot ? "PASS" : "FAIL",
    };
    this.checks.push(check);
  }

  private expectedDevelopmentFor(characterId: string): string[] {
    switch (characterId) {
      case "PROTAGONIST":
        return ["AWAKENING", "CONFUSION", "DECISION"];
      case "CARDINAL_OF_TYPES":
        return ["AUTHORITY", "OFFER", "CONSEQUENCE"];
      case "ASYNC_CHOIR":
        return ["HARMONY", "DISSONANCE", "RESOLUTION"];
      default:
        return [];
    }
  }

  private generateReport(): IntegrityReport {
    const summary = {
      total: this.checks.length,
      passed: this.checks.filter((c) => c.status === "PASS").length,
      failed: this.checks.filter((c) => c.status === "FAIL").length,
      critical: this.checks.filter((c) => c.status === "CRITICAL").length,
    };

    return {
      chapterId: this.chapterId,
      pass: "NERVE",
      timestamp: Date.now(),
      checks: this.checks,
      summary,
    };
  }
}
