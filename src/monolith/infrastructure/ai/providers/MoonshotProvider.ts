import {
  AIProvider,
  AIRequestParams,
  AIResponse,
  AIStreamEvent,
} from "./AIProvider.js";
import { ConfigService } from "../../config/ConfigService.js";

interface MoonshotResponse {
  id: string;
  choices: {
    index: number;
    message: {
      role: string;
      content: string | null;
      tool_calls?: any[];
    };
    finish_reason: string;
  }[];
  usage?: {
    total_tokens: number;
    completion_tokens: number;
    prompt_tokens: number;
  };
}

interface MoonshotStreamChunk {
  id: string;
  choices: {
    index: number;
    delta: {
      role?: string;
      content?: string;
      tool_calls?: any[];
    };
    finish_reason: string | null;
  }[];
  usage?: {
    total_tokens: number;
    completion_tokens: number;
    prompt_tokens: number;
  };
}

export class MoonshotProvider implements AIProvider {
  private static readonly BASE_URL =
    "https://api.moonshot.ai/v1/chat/completions";

  constructor(private apiKey: string) {}

  private getHeaders() {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    };
  }

  async createMessage(params: AIRequestParams): Promise<AIResponse> {
    const payload = {
      model: params.model,
      messages: params.messages.map((m) => {
        let content =
          typeof m.content === "string" ? m.content : JSON.stringify(m.content);
        // Moonshot/Kimi strict mode: Assistant content must not be empty
        if (m.role === "assistant" && !content) {
          content = "...";
        }
        return { role: m.role, content };
      }),
      max_tokens: params.max_tokens || 1024,
      stream: false,
      tools: params.tools?.map((t) => ({
        type: "function",
        function: {
          name: t.name,
          description: t.description,
          parameters: t.input_schema,
        },
      })),
    };

    let response: Response | undefined;
    let lastError: Error | undefined;

    for (let i = 0; i < 5; i++) {
      try {
        response = await fetch(MoonshotProvider.BASE_URL, {
          method: "POST",
          headers: this.getHeaders(),
          body: JSON.stringify(payload),
        });

        if (response.status === 429) {
          const delay = (i + 1) * 3000 + Math.random() * 1000;
          if (process.env.MARIE_DEBUG)
            console.log(
              `[Moonshot] Rate limit 429. Retrying in ${Math.round(delay)}ms... (Attempt ${i + 1}/5)`,
            );
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
        break;
      } catch (err: any) {
        lastError = err;
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }

    if (!response?.ok) {
      const text = await response?.text();
      throw (
        lastError ||
        new Error(`Moonshot API Error ${response?.status}: ${text}`)
      );
    }

    const data = (await response.json()) as MoonshotResponse;
    const choice = data.choices[0];

    if (!choice) {
      throw new Error("Moonshot API returned no choices.");
    }

    return {
      role: "assistant",
      content: choice.message.content || "",
      tool_uses: choice.message.tool_calls?.map((tc) => ({
        id: tc.id,
        name: tc.function.name,
        input: JSON.parse(tc.function.arguments || "{}"),
      })),
    };
  }

  async createMessageStream(
    params: AIRequestParams,
    onUpdate: (event: AIStreamEvent) => void,
    signal?: AbortSignal,
  ): Promise<AIResponse> {
    const startTime = Date.now();
    onUpdate({ type: "run_started", timestamp: startTime });
    onUpdate({
      type: "stage_change",
      stage: "thinking",
      label: "Kimi is thinking...",
    });

    const payload = {
      model: params.model,
      messages: params.messages.map((m) => {
        let content =
          typeof m.content === "string" ? m.content : JSON.stringify(m.content);
        // Moonshot/Kimi strict mode: Assistant content must not be empty
        if (m.role === "assistant" && !content) {
          content = "...";
        }
        return { role: m.role, content };
      }),
      max_tokens: params.max_tokens || 1024,
      stream: true,
      tools: params.tools?.map((t) => ({
        type: "function",
        function: {
          name: t.name,
          description: t.description,
          parameters: t.input_schema,
        },
      })),
    };

    let response: Response | undefined;
    let lastError: Error | undefined;

    for (let i = 0; i < 5; i++) {
      try {
        response = await fetch(MoonshotProvider.BASE_URL, {
          method: "POST",
          headers: {
            ...this.getHeaders(),
            Accept: "text/event-stream",
          },
          body: JSON.stringify(payload),
          signal,
        });

        if (response.status === 429) {
          const delay = (i + 1) * 3000 + Math.random() * 1000;
          if (process.env.MARIE_DEBUG)
            console.log(
              `[Moonshot] Rate limit 429. Retrying in ${Math.round(delay)}ms... (Attempt ${i + 1}/5)`,
            );
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
        break;
      } catch (err: any) {
        lastError = err;
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }

    if (!response?.ok) {
      const text = await response?.text();
      throw (
        lastError ||
        new Error(`Moonshot API Error ${response?.status}: ${text}`)
      );
    }

    if (!response.body) {
      throw new Error("Moonshot API returned no response body.");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let finalContent = "";
    let hasStartedContent = false;
    const toolUses: any[] = [];

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === "data: [DONE]") continue;
          if (!trimmed.startsWith("data: ")) continue;

          try {
            const dataStr = trimmed.substring(6);
            const chunk = JSON.parse(dataStr) as MoonshotStreamChunk;

            if (chunk.usage) {
              onUpdate({
                type: "usage",
                usage: {
                  totalTokens: chunk.usage.total_tokens,
                  inputTokens: chunk.usage.prompt_tokens,
                  outputTokens: chunk.usage.completion_tokens,
                },
              });
            }

            const choice = chunk.choices[0];
            if (!choice) continue;

            const delta = choice.delta;
            if (delta?.content) {
              if (!hasStartedContent) {
                hasStartedContent = true;
                onUpdate({
                  type: "stage_change",
                  stage: "responding",
                  label: "Kimi is responding...",
                });
              }
              finalContent += delta.content;
              onUpdate({ type: "content_delta", text: delta.content });
            }

            if (delta?.tool_calls) {
              for (const tc of delta.tool_calls) {
                onUpdate({
                  type: "tool_call_delta",
                  index: tc.index,
                  id: tc.id,
                  name: tc.function?.name,
                  argumentsDelta: tc.function?.arguments,
                });

                // Internal tracking for the final response object
                let internalTc = toolUses[tc.index];
                if (!internalTc) {
                  internalTc = {
                    id: tc.id,
                    name: tc.function?.name,
                    input: "",
                  };
                  toolUses[tc.index] = internalTc;
                }
                if (tc.function?.arguments) {
                  internalTc.input += tc.function.arguments;
                }
              }
            }
          } catch (e) {
            console.error("Error parsing Moonshot stream chunk", e);
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    const endTime = Date.now();
    onUpdate({
      type: "run_completed",
      timestamp: endTime,
      durationMs: endTime - startTime,
    });

    return {
      role: "assistant",
      content: finalContent || "",
      tool_uses:
        toolUses.length > 0
          ? toolUses.filter(Boolean).map((tu) => ({
              id: tu.id,
              name: tu.name,
              input: JSON.parse(tu.input || "{}"),
            }))
          : undefined,
    };
  }

  estimateTokens(text: string): number {
    const tokensPerChar = ConfigService.getTokensPerChar();
    return Math.ceil(text.length * tokensPerChar);
  }

  async listModels(): Promise<{ id: string; name: string }[]> {
    return [
      { id: "kimi-k2.5", name: "Kimi k2.5" },
      { id: "kimi-k2-turbo-preview", name: "Kimi k2 Turbo Preview" },
      { id: "kimi-k2-thinking", name: "Kimi k2 Thinking" },
      { id: "moonshot-v1-8k", name: "Moonshot v1 8k" },
      { id: "moonshot-v1-32k", name: "Moonshot v1 32k" },
      { id: "moonshot-v1-128k", name: "Moonshot v1 128k" },
    ];
  }
}
