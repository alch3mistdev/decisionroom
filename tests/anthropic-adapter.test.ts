import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const parseMock = vi.fn();
const createMock = vi.fn();
const AnthropicCtorMock = vi.fn(function AnthropicMock(this: { messages: { parse: typeof parseMock; create: typeof createMock } }) {
  this.messages = { parse: parseMock, create: createMock };
});
const zodOutputFormatMock = vi.fn((schema: unknown) => ({ type: "json_schema", schema }));

vi.mock("@anthropic-ai/sdk", () => ({
  default: AnthropicCtorMock,
}));

vi.mock("@anthropic-ai/sdk/helpers/zod", () => ({
  zodOutputFormat: zodOutputFormatMock,
}));

describe("AnthropicAdapter", () => {
  beforeEach(() => {
    vi.resetModules();
    parseMock.mockReset();
    createMock.mockReset();
    AnthropicCtorMock.mockClear();
    zodOutputFormatMock.mockClear();
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_MODEL;
  });

  it("returns parsed structured output", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    parseMock.mockResolvedValue({
      parsed_output: { ok: true },
    });

    const { AnthropicAdapter } = await import("@/lib/llm/anthropic-adapter");
    const adapter = new AnthropicAdapter();
    const result = await adapter.generateJson({
      systemPrompt: "Return object",
      userPrompt: "Return object",
      schema: z.object({ ok: z.boolean() }),
    });

    expect(result.ok).toBe(true);
    expect(parseMock).toHaveBeenCalledTimes(1);
    expect(zodOutputFormatMock).toHaveBeenCalledTimes(1);
  });

  it("retries once and succeeds after first structured parse failure", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    parseMock
      .mockRejectedValueOnce(new Error("failed to parse output"))
      .mockResolvedValueOnce({
        parsed_output: { value: 42 },
      });

    const { AnthropicAdapter } = await import("@/lib/llm/anthropic-adapter");
    const adapter = new AnthropicAdapter();
    const result = await adapter.generateJson({
      systemPrompt: "Return object",
      userPrompt: "Return object",
      schema: z.object({ value: z.number() }),
    });

    expect(result.value).toBe(42);
    expect(parseMock).toHaveBeenCalledTimes(2);
  });

  it("fails with provider unavailable when API key is missing", async () => {
    process.env.ANTHROPIC_API_KEY = "";

    const { AnthropicAdapter } = await import("@/lib/llm/anthropic-adapter");
    const adapter = new AnthropicAdapter();

    await expect(
      adapter.generateJson({
        systemPrompt: "Return object",
        userPrompt: "Return object",
        schema: z.object({ value: z.number() }),
      }),
    ).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
  });

  it("throws timeout when the provider does not respond in time", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    const { ModelTimeoutError } = await import("@/lib/errors");
    parseMock.mockRejectedValue(
      new ModelTimeoutError("Anthropic response (claude-3-5-sonnet-latest) timed out after 40000ms"),
    );

    const { AnthropicAdapter } = await import("@/lib/llm/anthropic-adapter");
    const adapter = new AnthropicAdapter();

    await expect(
      adapter.generateJson({
        systemPrompt: "Return object",
        userPrompt: "Return object",
        schema: z.object({ value: z.number() }),
      }),
    ).rejects.toMatchObject({ code: "MODEL_TIMEOUT" });
  });

  it("falls back to text-json mode when structured outputs are not supported by model", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    process.env.ANTHROPIC_MODEL = "claude-3-5-sonnet-latest";
    createMock.mockResolvedValue({
      content: [
        {
          type: "text",
          text: JSON.stringify({ value: 42 }),
        },
      ],
    });

    const { AnthropicAdapter } = await import("@/lib/llm/anthropic-adapter");
    const adapter = new AnthropicAdapter();
    const result = await adapter.generateJson({
      systemPrompt: "Return object",
      userPrompt: "Return object",
      schema: z.object({ value: z.number() }),
    });

    expect(result.value).toBe(42);
    expect(parseMock).not.toHaveBeenCalled();
    expect(createMock).toHaveBeenCalledTimes(1);
  });
});
