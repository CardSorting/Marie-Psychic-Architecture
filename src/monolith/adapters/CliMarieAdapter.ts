import { MarieCallbacks, RunTelemetry } from "../domain/marie/MarieTypes.js";
import { registerMarieToolsCLI } from "../cli/MarieToolDefinitionsCLI.js";
import { Storage, SessionMetadata } from "../cli/storage.js";
import { JoyServiceCLI } from "../cli/services/JoyServiceCLI.js";
import { MarieRuntime } from "../runtime/MarieRuntime.js";
import { JoyAutomationServiceCLI } from "../cli/services/JoyAutomationServiceCLI.js";
import {
  MarieProviderType,
  RuntimeAutomationPort,
  RuntimeConfigPort,
  RuntimeSessionStorePort,
} from "../runtime/types.js";
import { createDefaultProvider } from "../runtime/providerFactory.js";
import { RuntimeAdapterBase } from "../runtime/RuntimeAdapterBase.js";
import { CliFileSystemPort } from "../cli/CliFileSystemPort.js";
import { NarrativeAutomationServiceCLI } from "../services/NarrativeAutomationServiceCLI.js";
import { registerNovelTools } from "../cli/NovelProductionTools.js";
import { NovelProductionService } from "../infrastructure/ai/narrative/NovelProductionService.js";

class CliConfigPort implements RuntimeConfigPort {
  getAiProvider(): MarieProviderType {
    const config = Storage.getConfig();
    return config.aiProvider;
  }

  getApiKey(provider: MarieProviderType): string {
    const config = Storage.getConfig();
    if (provider === "openrouter")
      return (config as any).openrouterApiKey || "";
    if (provider === "cerebras") return (config as any).cerebrasApiKey || "";
    if (provider === "nvidia") return (config as any).nvidiaApiKey || "";
    if (provider === "moonshot") return (config as any).moonshotApiKey || "";
    return config.apiKey || "";
  }
}

class CliSessionStorePort implements RuntimeSessionStorePort {
  async getSessions(): Promise<Record<string, any[]>> {
    return Storage.getSessions();
  }

  async saveSessions(sessions: Record<string, any[]>): Promise<void> {
    Storage.saveSessions(sessions);
  }

  async getSessionMetadata(): Promise<SessionMetadata[]> {
    return Storage.getSessionMetadata();
  }

  async saveSessionMetadata(metadata: SessionMetadata[]): Promise<void> {
    Storage.saveSessionMetadata(metadata);
  }

  async getCurrentSessionId(): Promise<string> {
    return Storage.getCurrentSessionId();
  }

  async setCurrentSessionId(id: string): Promise<void> {
    Storage.setCurrentSessionId(id);
  }

  async getLastTelemetry(): Promise<RunTelemetry | undefined> {
    return Storage.getLastTelemetry();
  }

  async setLastTelemetry(telemetry: RunTelemetry | undefined): Promise<void> {
    Storage.setLastTelemetry(telemetry);
  }
}

export class MarieCLI extends RuntimeAdapterBase<RuntimeAutomationPort> {
  private readonly joyService: JoyServiceCLI;

  constructor(workingDir: string = process.cwd()) {
    const joyService = new JoyServiceCLI();
    const automationService = new JoyAutomationServiceCLI(
      workingDir,
      joyService,
    );
    const narrativeAutomationService = new NarrativeAutomationServiceCLI(
      workingDir,
      joyService,
    );
    const novelProductionService = new NovelProductionService(workingDir);

    const runtime = new MarieRuntime<JoyAutomationServiceCLI>({
      config: new CliConfigPort(),
      sessionStore: new CliSessionStorePort(),
      toolRegistrar: (
        registry,
        automation,
        narrativeAutomation,
        novelService,
      ) => {
        registerMarieToolsCLI(registry, automation, workingDir);
        if (novelService) {
          registerNovelTools(
            registry,
            novelService,
            narrativeAutomation,
            workingDir,
          );
        }
      },
      providerFactory: createDefaultProvider,
      automationService,
      narrativeAutomationService,
      novelProductionService,
      onProgressEvent: (event) => joyService.emitRunProgress(event as any),
      shouldBypassApprovals: () => true,
      fs: new CliFileSystemPort(workingDir),
    });

    super(runtime);
    this.joyService = joyService;
  }

  public dispose() {
    super.dispose();
    this.joyService.dispose();
  }
}
