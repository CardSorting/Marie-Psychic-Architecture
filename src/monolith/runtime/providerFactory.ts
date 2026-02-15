import { AnthropicProvider } from "../infrastructure/ai/providers/AnthropicProvider.js";
import { OpenRouterProvider } from "../infrastructure/ai/providers/OpenRouterProvider.js";
import { CerebrasProvider } from "../infrastructure/ai/providers/CerebrasProvider.js";
import { NvidiaProvider } from "../infrastructure/ai/providers/NvidiaProvider.js";
import { MoonshotProvider } from "../infrastructure/ai/providers/MoonshotProvider.js";
import { AIProvider } from "../infrastructure/ai/providers/AIProvider.js";
import { MarieProviderType } from "./types.js";

export function createDefaultProvider(
  providerType: MarieProviderType,
  apiKey: string,
): AIProvider {
  if (providerType === "openrouter") return new OpenRouterProvider(apiKey);
  if (providerType === "cerebras") return new CerebrasProvider(apiKey);
  if (providerType === "nvidia") return new NvidiaProvider(apiKey);
  if (providerType === "moonshot") return new MoonshotProvider(apiKey);
  return new AnthropicProvider(apiKey);
}
