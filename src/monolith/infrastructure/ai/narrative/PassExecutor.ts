import { MarieCLI } from "../../../adapters/CliMarieAdapter.js";
import { Log } from "./ProductionLogger.js";
import { WorldService } from "./WorldService.js";
import { EditorialService } from "./EditorialService.js";
import { NovelChapter } from "./NovelProductionService.js";
import * as path from "path";
import * as fs from "fs/promises";

// Import Passes
import { passBlueprint } from "./passes/PassBlueprint.js";
import { passSkeleton } from "./passes/PassSkeleton.js";
import { passFlesh } from "./passes/PassFlesh.js";
import { passNerve } from "./passes/PassNerve.js";
import { passSoul } from "./passes/PassSoul.js";
import { passContinuity } from "./passes/PassContinuity.js";
import { passReception } from "./passes/PassReception.js";
import { passEvolve } from "./passes/PassEvolve.js";
import { passSimulation } from "./passes/PassSimulation.js";
import { passFoundation } from "./passes/PassFoundation.js";
import { passBeats } from "./passes/PassBeats.js";

export interface ExecutionResult {
    success: boolean;
    nextPass?: string;
    feedback?: any;
}

export class PassExecutor {
    constructor(
        private marie: MarieCLI,
        private log: Log,
        private worldService: WorldService,
        private editorialService: EditorialService,
        private workingDir: string
    ) { }

    public async execute(
        pass: string,
        ch: NovelChapter,
        prevSummary: string,
        rejectionFeedback?: any
    ): Promise<ExecutionResult> {
        const chapFileName = `Chapter_${ch.id}_${ch.title.replace(/[^a-zA-Z0-9]/g, "_")}`;
        const targetPath = path.join(this.workingDir, ".vault", "novel", "chapters", `${chapFileName}.md`);
        const blueprintPath = path.join(this.workingDir, ".vault", "novel", "chapters", `${chapFileName}_Blueprint.json`);

        // Ensure Directory
        await fs.mkdir(path.dirname(targetPath), { recursive: true });

        let passOk = false;
        let nextPass: string | undefined = undefined;
        let feedback: any = undefined;

        switch (pass) {
            case "SIMULATION":
                passOk = await passSimulation(this.marie, ch, this.log, this.worldService);
                if (passOk) nextPass = "FOUNDATION";
                break;

            case "FOUNDATION":
                passOk = await passFoundation(
                    this.marie,
                    ch,
                    blueprintPath,
                    this.log,
                    this.worldService,
                    prevSummary
                );
                if (passOk) nextPass = "BEATS";
                break;

            case "BEATS":
                passOk = await passBeats(
                    this.marie,
                    ch,
                    blueprintPath,
                    targetPath,
                    this.log,
                    this.worldService.getWorldContext([ch.title])
                );
                if (passOk) nextPass = "DRAFT";
                break;

            case "DRAFT":
                passOk = await passFlesh(
                    this.marie,
                    ch,
                    targetPath,
                    this.log,
                    this.worldService.getWorldContext([ch.title]),
                    this.editorialService,
                    this.worldService
                );
                if (passOk) nextPass = "COHESION";
                break;

            case "COHESION":
                // Structured cohesion combines Nerve and Soul
                await passNerve(
                    this.marie,
                    ch,
                    targetPath,
                    this.log,
                    this.worldService.getWorldContext([ch.title]),
                    this.editorialService
                );
                passOk = await passSoul(
                    this.marie,
                    ch,
                    targetPath,
                    this.log,
                    this.worldService.getWorldContext([ch.title]),
                    this.editorialService
                );
                if (passOk) nextPass = "CANON";
                break;

            case "BLUEPRINT":
                // 1. Showrunner Check (only if not a retry)
                if (!rejectionFeedback) {
                    await passContinuity(this.marie, ch, this.log, this.worldService, prevSummary);
                }
                // 2. Blueprint
                passOk = await passBlueprint(
                    this.marie,
                    ch,
                    blueprintPath,
                    this.log,
                    this.worldService,
                    prevSummary,
                    rejectionFeedback
                );
                if (passOk) nextPass = "SKELETON";
                break;

            case "SKELETON":
                passOk = await passSkeleton(
                    this.marie,
                    ch,
                    blueprintPath,
                    targetPath,
                    this.log,
                    this.worldService.getWorldContext([ch.title])
                );
                if (passOk) nextPass = "FLESH";
                break;

            case "FLESH":
                passOk = await passFlesh(
                    this.marie,
                    ch,
                    targetPath,
                    this.log,
                    this.worldService.getWorldContext([ch.title]),
                    this.editorialService,
                    this.worldService
                );
                if (passOk) nextPass = "NERVE";
                break;

            case "NERVE":
                passOk = await passNerve(
                    this.marie,
                    ch,
                    targetPath,
                    this.log,
                    this.worldService.getWorldContext([ch.title]),
                    this.editorialService
                );
                if (passOk) nextPass = "SOUL";
                break;

            case "SOUL":
                passOk = await passSoul(
                    this.marie,
                    ch,
                    targetPath,
                    this.log,
                    this.worldService.getWorldContext([ch.title]),
                    this.editorialService
                );
                if (passOk) nextPass = "RECEPTION";
                break;

            case "RECEPTION":
                // The Critics Circle
                passOk = await passReception(this.marie, targetPath, this.log, ch.id);

                if (!passOk) {
                    // Logic: If reception failed, we generate feedback and return success=false
                    // The Director will handle the state regression.
                    feedback = { verdict: "BORING_DETECTED", plotHoles: ["General lack of engagement"], boredomIndex: 9 };
                } else {
                    nextPass = "EVOLVE";
                }
                break;

            case "EVOLVE":
                await passEvolve(this.marie, targetPath, this.log, ch.id, this.worldService);
                passOk = true;
                nextPass = "CANON";
                break;

            case "CANON":
                passOk = true;
                break;

            default:
                throw new Error(`Unknown pass: ${pass}`);
        }

        return { success: passOk, nextPass, feedback };
    }
}
