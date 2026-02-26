import { describe, expect, it } from "vitest";
import { z } from "zod";

const runLiveTests = process.env.LIVE_LLM_TESTS === "1";
const liveDescribe = runLiveTests ? describe : describe.skip;

liveDescribe("live llm smoke", () => {
  it("anthropic returns valid structured output when configured", async () => {
    if (!process.env.ANTHROPIC_API_KEY?.trim()) {
      return;
    }

    const { AnthropicAdapter } = await import("@/lib/llm/anthropic-adapter");
    const adapter = new AnthropicAdapter();
    if (!(await adapter.isHealthy())) {
      return;
    }

    const result = await adapter.generateJson({
      systemPrompt: "Return a JSON object with answer and source fields.",
      userPrompt: "What is 2 + 2?",
      schema: z.object({
        answer: z.number(),
        source: z.string(),
      }),
      temperature: 0,
      maxTokens: 120,
    });

    expect(result.answer).toBeTypeOf("number");
    expect(result.source.length).toBeGreaterThan(0);
  });

  it("ollama returns valid structured output when reachable", async () => {
    const { OllamaAdapter } = await import("@/lib/llm/ollama-adapter");
    const adapter = new OllamaAdapter();
    if (!(await adapter.isHealthy())) {
      return;
    }

    const result = await adapter.generateJson({
      systemPrompt: "Return a JSON object with answer and source fields.",
      userPrompt: "What is 2 + 2?",
      schema: z.object({
        answer: z.number(),
        source: z.string(),
      }),
      temperature: 0,
      maxTokens: 120,
    });

    expect(result.answer).toBeTypeOf("number");
    expect(result.source.length).toBeGreaterThan(0);
  });
});
