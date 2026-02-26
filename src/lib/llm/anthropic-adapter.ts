import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { ZodError } from "zod";

import { env } from "@/lib/env";
import {
  ModelOutputInvalidError,
  ModelTimeoutError,
  ProviderUnavailableError,
  withTimeout,
} from "@/lib/errors";
import type { LLMAdapter, LLMJsonRequest } from "@/lib/llm/base";

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

  private toProviderError(error: unknown): ProviderUnavailableError | null {
    if (error instanceof Error && /auth|401|403|rate|quota|429/i.test(error.message)) {
      return new ProviderUnavailableError("Anthropic request failed due to API/auth limits.", {
        provider: this.name,
        model: this.model,
        reason: error.message,
      });
    }

    return null;
  }

  private async generateStructured<T>(
    request: LLMJsonRequest<T>,
    mode: "primary" | "retry",
    retryReason?: string,
  ): Promise<T> {
    if (!this.client) {
      throw new ProviderUnavailableError("Anthropic API key is not configured.", {
        provider: this.name,
        model: this.model,
      });
    }

    const strictMode = mode === "retry";
    const timeoutMs =
      mode === "retry"
        ? 45000
        : Math.max(40000, Math.min(90000, Math.round((request.maxTokens ?? 1200) * 50)));
    const response = await withTimeout(
      this.client.messages.parse({
        model: this.model,
        max_tokens: request.maxTokens ?? 1200,
        temperature: strictMode ? 0 : request.temperature ?? 0.2,
        system: strictMode
          ? [
              "You are a strict structured-output engine.",
              "Return valid JSON that exactly matches the schema.",
              "Do not include markdown, prose, or commentary.",
            ].join("\n")
          : `${request.systemPrompt}\nReturn valid JSON only.`,
        messages: [
          {
            role: "user",
            content: strictMode
              ? [
                  request.userPrompt,
                  "Previous output failed structured parsing.",
                  retryReason ? `Failure reason: ${retryReason}` : "",
                  "Retry now and return only valid JSON matching the schema.",
                ]
                  .filter(Boolean)
                  .join("\n\n")
              : request.userPrompt,
          },
        ],
        output_config: {
          format: zodOutputFormat(request.schema),
        },
      }),
      timeoutMs,
      `Anthropic response (${this.model})`,
    );

    if (response.parsed_output == null) {
      throw new ModelOutputInvalidError("Anthropic returned empty structured output", {
        provider: this.name,
        model: this.model,
      });
    }

    return request.schema.parse(response.parsed_output);
  }

  async generateJson<T>(request: LLMJsonRequest<T>): Promise<T> {
    try {
      try {
        return await this.generateStructured(request, "primary");
      } catch (primaryError) {
        if (primaryError instanceof ProviderUnavailableError) {
          throw primaryError;
        }

        const providerError = this.toProviderError(primaryError);
        if (providerError) {
          throw providerError;
        }

        if (primaryError instanceof ModelTimeoutError) {
          throw primaryError;
        }

        try {
          return await this.generateStructured(
            request,
            "retry",
            primaryError instanceof Error ? primaryError.message : "Unknown parse failure",
          );
        } catch (retryError) {
          if (retryError instanceof ProviderUnavailableError) {
            throw retryError;
          }

          const retryProviderError = this.toProviderError(retryError);
          if (retryProviderError) {
            throw retryProviderError;
          }

          if (retryError instanceof ModelTimeoutError) {
            throw retryError;
          }

          throw new ModelOutputInvalidError("Anthropic returned invalid structured output after retry", {
            provider: this.name,
            model: this.model,
            reason: retryError instanceof Error ? retryError.message : "Unknown retry parse failure",
            firstFailureReason:
              primaryError instanceof Error ? primaryError.message : "Unknown parse failure",
          });
        }
      }
    } catch (error) {
      if (error instanceof ProviderUnavailableError || error instanceof ModelTimeoutError) {
        throw error;
      }

      if (error instanceof ModelOutputInvalidError || error instanceof ZodError || error instanceof SyntaxError) {
        throw new ModelOutputInvalidError("Anthropic returned invalid structured output", {
          provider: this.name,
          model: this.model,
          reason: error instanceof Error ? error.message : "Unknown parse failure",
        });
      }

      throw error;
    }
  }
}
