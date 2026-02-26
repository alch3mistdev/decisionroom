import Anthropic from "@anthropic-ai/sdk";
import { ZodError } from "zod";

import { env } from "@/lib/env";
import {
  ModelOutputInvalidError,
  ProviderUnavailableError,
  withTimeout,
} from "@/lib/errors";
import type { LLMAdapter, LLMJsonRequest } from "@/lib/llm/base";
import { parseJsonFromText } from "@/lib/utils/json";

export class AnthropicAdapter implements LLMAdapter {
  readonly name = "anthropic";
  readonly model = env.ANTHROPIC_MODEL;
  private readonly apiKey = env.ANTHROPIC_API_KEY;
  private readonly client =
    this.apiKey && this.apiKey.trim().length > 0
      ? new Anthropic({ apiKey: this.apiKey })
      : null;

  async isHealthy(): Promise<boolean> {
    return Boolean(this.client);
  }

  async generateJson<T>(request: LLMJsonRequest<T>): Promise<T> {
    if (!this.client) {
      throw new ProviderUnavailableError("Anthropic API key is not configured.", {
        provider: this.name,
        model: this.model,
      });
    }

    try {
      const response = await withTimeout(
        this.client.messages.create({
          model: this.model,
          max_tokens: request.maxTokens ?? 1500,
          temperature: request.temperature ?? 0.2,
          system: `${request.systemPrompt}\nReturn valid JSON only.`,
          messages: [
            {
              role: "user",
              content: request.userPrompt,
            },
          ],
        }),
        40000,
        `Anthropic response (${this.model})`,
      );

      const content = response.content
        .map((block) => (block.type === "text" ? block.text : ""))
        .join("\n");

      const parsed = parseJsonFromText(content);
      return request.schema.parse(parsed);
    } catch (error) {
      if (error instanceof ZodError || error instanceof SyntaxError) {
        throw new ModelOutputInvalidError("Anthropic returned invalid structured output", {
          provider: this.name,
          model: this.model,
          reason: error.message,
        });
      }

      if (error instanceof Error && /auth|401|403|rate|quota|429/i.test(error.message)) {
        throw new ProviderUnavailableError("Anthropic request failed due to API/auth limits.", {
          provider: this.name,
          model: this.model,
          reason: error.message,
        });
      }

      throw error;
    }
  }
}
