import { Ollama } from "ollama";
import { ZodError } from "zod";

import { env } from "@/lib/env";
import { ModelOutputInvalidError, ProviderUnavailableError, withTimeout } from "@/lib/errors";
import type { LLMAdapter, LLMJsonRequest } from "@/lib/llm/base";
import { parseJsonFromText } from "@/lib/utils/json";

export class OllamaAdapter implements LLMAdapter {
  readonly name = "ollama";
  readonly model = env.OLLAMA_MODEL;
  private readonly client = new Ollama({ host: env.OLLAMA_BASE_URL });

  private async chat(messages: Array<{ role: "system" | "user"; content: string }>, temperature: number) {
    return withTimeout(
      this.client.chat({
        model: this.model,
        stream: false,
        format: "json",
        options: {
          temperature,
        },
        messages,
      }),
      30000,
      `Ollama response (${this.model})`,
    );
  }

  async isHealthy(): Promise<boolean> {
    try {
      const list = await withTimeout(this.client.list(), 3500, "Ollama health check");
      return list.models.length > 0;
    } catch {
      return false;
    }
  }

  async generateJson<T>(request: LLMJsonRequest<T>): Promise<T> {
    const baseTemperature = request.temperature ?? 0.2;
    let firstFailureReason = "unknown";
    let firstOutputSnippet = "";

    try {
      const primary = await this.chat(
        [
          {
            role: "system",
            content: `${request.systemPrompt}\nOutput strict JSON only.`,
          },
          {
            role: "user",
            content: request.userPrompt,
          },
        ],
        baseTemperature,
      );

      firstOutputSnippet = primary.message.content.slice(0, 800);

      try {
        const parsed = parseJsonFromText(primary.message.content);
        return request.schema.parse(parsed);
      } catch (parseOrShapeError) {
        firstFailureReason =
          parseOrShapeError instanceof Error ? parseOrShapeError.message : "Unknown parse failure";
      }

      const retry = await this.chat(
        [
          {
            role: "system",
            content:
              "You are a strict JSON generator. Return valid JSON only, no markdown, no explanation, no code fences.",
          },
          {
            role: "user",
            content: [
              request.userPrompt,
              "Your previous output was invalid for strict JSON parsing.",
              "Retry and return only valid JSON that matches the requested structure.",
            ].join("\n\n"),
          },
        ],
        0,
      );

      try {
        const parsedRetry = parseJsonFromText(retry.message.content);
        return request.schema.parse(parsedRetry);
      } catch (retryError) {
        throw new ModelOutputInvalidError("Ollama returned invalid structured output after retry", {
          provider: this.name,
          model: this.model,
          reason: retryError instanceof Error ? retryError.message : "Unknown retry parse failure",
          firstFailureReason,
          firstOutputSnippet,
          retryOutputSnippet: retry.message.content.slice(0, 800),
        });
      }
    } catch (error) {
      if (error instanceof ModelOutputInvalidError) {
        throw error;
      }

      if (error instanceof Error && /connect|ECONN|socket|fetch/i.test(error.message)) {
        throw new ProviderUnavailableError("Ollama is unavailable. Start Ollama and ensure the model is pulled.", {
          provider: this.name,
          model: this.model,
          reason: error.message,
        });
      }

      if (error instanceof ZodError || error instanceof SyntaxError || error instanceof Error) {
        throw new ModelOutputInvalidError("Ollama returned invalid structured output", {
          provider: this.name,
          model: this.model,
          reason: error.message,
          firstFailureReason,
          firstOutputSnippet,
        });
      }

      throw error;
    }
  }
}
