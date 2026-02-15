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
    private static readonly BASE_URL = "https://api.moonshot.ai/v1/chat/completions";

    constructor(private apiKey: string) { }

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
            messages: params.messages.map((m) => ({
                role: m.role,
                content:
                    typeof m.content === "string" ? m.content : JSON.stringify(m.content),
            })),
            max_tokens: params.max_tokens || 1024,
            stream: false,
        };

        const response = await fetch(MoonshotProvider.BASE_URL, {
            method: "POST",
            headers: this.getHeaders(),
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Moonshot API Error ${response.status}: ${text}`);
        }

        const data = (await response.json()) as MoonshotResponse;
        const choice = data.choices[0];

        if (!choice) {
            throw new Error("Moonshot API returned no choices.");
        }

        return {
            role: "assistant",
            content: choice.message.content || "",
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
            messages: params.messages.map((m) => ({
                role: m.role,
                content:
                    typeof m.content === "string" ? m.content : JSON.stringify(m.content),
            })),
            max_tokens: params.max_tokens || 1024,
            stream: true,
        };

        const response = await fetch(MoonshotProvider.BASE_URL, {
            method: "POST",
            headers: {
                ...this.getHeaders(),
                Accept: "text/event-stream",
            },
            body: JSON.stringify(payload),
            signal,
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Moonshot API Error ${response.status}: ${text}`);
        }

        if (!response.body) {
            throw new Error("Moonshot API returned no response body.");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let finalContent = "";
        let hasStartedContent = false;

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

                        const delta = chunk.choices[0]?.delta;
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
            content: finalContent,
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
