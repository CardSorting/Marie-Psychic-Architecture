import { WorldEntity, WorldBible } from "./WorldBible.js";

export interface CharacterState {
    health: number; // 0-100
    morale: number; // 0-100
    energy: number; // 0-100
    locationId?: string; // Where are they?
    currentAction?: string; // "Sleeping", "Fighting", "Traveling"
}

export interface SimulationTurn {
    characterId: string;
    action: string;
    targetId?: string; // Object of action
    result: string;
    stateChange?: Partial<CharacterState>;
}

export class CharacterSimulator {

    public static simulateTurn(char: WorldEntity, world: WorldBible): SimulationTurn {
        // Simple heuristic simulation
        // In a real implementation, this would call an LLM or use complex rules.

        // 1. Check Needs
        // 2. Check Goals
        // 3. Check Threats

        if (char.state === "Ruined" || char.state === "Defunct") {
            return { characterId: char.id, action: "Decay", result: "Nothing happens." };
        }

        const action = this.decideAction(char, world);

        return {
            characterId: char.id,
            action: action.verb,
            targetId: action.target,
            result: `Performed ${action.verb} on ${action.target || "self"}.`
        };
    }

    private static decideAction(char: WorldEntity, world: WorldBible): { verb: string, target?: string } {
        // Fallback Logic
        if (!char.goals || char.goals.length === 0) return { verb: "Idle" };

        const goal = char.goals[0]; // Primary goal

        if (goal.includes("Heresy")) return { verb: "Investigate", target: "Old Tech" };
        if (goal.includes("Stability")) return { verb: "Patrol", target: "Cathedral" };

        return { verb: "Contemplate", target: goal };
    }
}
