import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { toJSONSchema, ZodError } from "zod";

import { env } from "@/lib/env";
import {
  ModelOutputInvalidError,
  ModelTimeoutError,
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

  private supportsNativeStructuredOutput(model: string): boolean {
    const normalized = model.toLowerCase();
    return (
      normalized.includes("4-5") ||
      normalized.includes("4-6")
    );
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

  private timeoutForRequest(maxTokens: number | undefined, mode: "primary" | "retry"): number {
    if (mode === "retry") {
      return 45000;
    }

    return Math.max(40000, Math.min(90000, Math.round((maxTokens ?? 1200) * 50)));
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
      this.timeoutForRequest(request.maxTokens, mode),
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

  private async generateViaTextJson<T>(
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
    const schemaJson = JSON.stringify(toJSONSchema(request.schema));
    const response = await withTimeout(
      this.client.messages.create({
        model: this.model,
        max_tokens: request.maxTokens ?? 1200,
        temperature: strictMode ? 0 : request.temperature ?? 0.2,
        system: strictMode
          ? [
              "You are a strict JSON generator.",
              "Return valid JSON only, no prose, no markdown, no code fences.",
              "Output MUST match this JSON Schema exactly:",
              schemaJson,
            ].join("\n\n")
          : [
              request.systemPrompt,
              "Return valid JSON only.",
              "Output MUST match this JSON Schema exactly:",
              schemaJson,
            ].join("\n\n"),
        messages: [
          {
            role: "user",
            content: strictMode
              ? [
                  request.userPrompt,
                  retryReason ? `Previous failure: ${retryReason}` : "",
                  "Retry now and return only valid JSON matching the schema.",
                ]
                  .filter(Boolean)
                  .join("\n\n")
              : request.userPrompt,
          },
        ],
      }),
      this.timeoutForRequest(request.maxTokens, mode),
      `Anthropic response (${this.model})`,
    );

    const textContent = response.content
      .map((block) => (block.type === "text" ? block.text : ""))
      .join("\n")
      .trim();

    try {
      const parsed = parseJsonFromText(textContent);
      return request.schema.parse(parsed);
    } catch (error) {
      throw new ModelOutputInvalidError(
        strictMode
          ? "Anthropic text JSON fallback returned invalid structured output after retry"
          : "Anthropic text JSON fallback returned invalid structured output",
        {
          provider: this.name,
          model: this.model,
          reason: error instanceof Error ? error.message : "Unknown parse failure",
          outputSnippet: textContent.slice(0, 900),
        },
      );
    }
  }

  private isModelOutputIssue(error: unknown): boolean {
    return (
      error instanceof ModelOutputInvalidError ||
      error instanceof ZodError ||
      error instanceof SyntaxError ||
      error instanceof Error
    );
  }

  async generateJson<T>(request: LLMJsonRequest<T>): Promise<T> {
    if (!this.client) {
      throw new ProviderUnavailableError("Anthropic API key is not configured.", {
        provider: this.name,
        model: this.model,
      });
    }

    const structuredFailures: string[] = [];

    if (this.supportsNativeStructuredOutput(this.model)) {
      try {
        return await this.generateStructured(request, "primary");
      } catch (primaryError) {
        if (primaryError instanceof ProviderUnavailableError || primaryError instanceof ModelTimeoutError) {
          throw primaryError;
        }
        const providerError = this.toProviderError(primaryError);
        if (providerError) {
          throw providerError;
        }

        if (this.isModelOutputIssue(primaryError)) {
          structuredFailures.push(
            primaryError instanceof Error ? primaryError.message : "Unknown structured parse failure",
          );
        } else {
          throw primaryError;
        }
      }

      try {
        return await this.generateStructured(
          request,
          "retry",
          structuredFailures.at(-1) ?? "Unknown structured parse failure",
        );
      } catch (retryError) {
        if (retryError instanceof ProviderUnavailableError || retryError instanceof ModelTimeoutError) {
          throw retryError;
        }
        const retryProviderError = this.toProviderError(retryError);
        if (retryProviderError) {
          throw retryProviderError;
        }

        if (this.isModelOutputIssue(retryError)) {
          structuredFailures.push(
            retryError instanceof Error ? retryError.message : "Unknown structured retry failure",
          );
        } else {
          throw retryError;
        }
      }
    } else {
      structuredFailures.push(
        `Native structured output is not enabled for model ${this.model}; using text JSON mode.`,
      );
    }

    try {
      return await this.generateViaTextJson(
        request,
        "primary",
        structuredFailures.join(" | "),
      );
    } catch (textPrimaryError) {
      if (textPrimaryError instanceof ProviderUnavailableError || textPrimaryError instanceof ModelTimeoutError) {
        throw textPrimaryError;
      }
      const textProviderError = this.toProviderError(textPrimaryError);
      if (textProviderError) {
        throw textProviderError;
      }

      if (!this.isModelOutputIssue(textPrimaryError)) {
        throw textPrimaryError;
      }

      try {
        return await this.generateViaTextJson(
          request,
          "retry",
          textPrimaryError instanceof Error ? textPrimaryError.message : "Unknown text JSON parse failure",
        );
      } catch (textRetryError) {
        if (textRetryError instanceof ProviderUnavailableError || textRetryError instanceof ModelTimeoutError) {
          throw textRetryError;
        }
        const textRetryProviderError = this.toProviderError(textRetryError);
        if (textRetryProviderError) {
          throw textRetryProviderError;
        }

        throw new ModelOutputInvalidError("Anthropic returned invalid structured output", {
          provider: this.name,
          model: this.model,
          reason:
            textRetryError instanceof Error
              ? textRetryError.message
              : "Unknown text JSON retry failure",
          structuredFailures,
        });
      }
    }
  }
}
