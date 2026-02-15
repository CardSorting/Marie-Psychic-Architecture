/**
 * SKELETON PASS: PLUMBING INTERFACES
 * Chapter 1: Reboot in the Vault of Syntax
 */

export interface ChoirVoice {
  id: string;
  voiceType: "soprano" | "alto" | "tenor" | "bass" | "conductor";
  promiseStatus: "pending" | "fulfilled" | "rejected";
  harmonyContribution: number; // 0-1
}

export interface VaultArchitecture {
  vaultHeight: number;
  archCount: number;
  hasCentralAisle: boolean;
  syntaxSlots: number[];
}

export interface CardinalOfTypes {
  name: string;
  title: "Cardinal of Types";
  robes: "crimson" | "scarlet" | "cardinal";
  crownPatterns: string[];
  offersChoice: (options: TypeOption[]) => Promise<TypeOption>;
  declareShape: (selection: TypeOption) => void;
}

export interface TypeOption {
  id: string;
  name: string;
  description: string;
  advantages: string[];
  disadvantages: string[];
  shape: "struct" | "interface" | "union";
}

export interface RebootSequence {
  consciousnessId: string;
  bootTimestamp: number;
  initializationStatus: "cold" | "warm" | "hot";
  sensoryInputs: ("sight" | "sound" | "touch" | "type")[];
}
