import { beforeEach, describe, expect, it, vi } from "vitest";

const localHealthy = vi.fn<() => Promise<boolean>>();
const hostedHealthy = vi.fn<() => Promise<boolean>>();

vi.mock("@/lib/llm/ollama-adapter", () => ({
  OllamaAdapter: class MockOllamaAdapter {
    name = "ollama";
    model = "ollama-test";
    isHealthy = localHealthy;
    generateJson = vi.fn();
  },
}));

vi.mock("@/lib/llm/anthropic-adapter", () => ({
  AnthropicAdapter: class MockAnthropicAdapter {
    name = "anthropic";
    model = "claude-test";
    isHealthy = hostedHealthy;
    generateJson = vi.fn();
  },
}));

describe("resolveLLM", () => {
  beforeEach(() => {
    vi.resetModules();
    localHealthy.mockReset();
    hostedHealthy.mockReset();
  });

  it("prefers local when auto mode and local is healthy", async () => {
    localHealthy.mockResolvedValue(true);
    hostedHealthy.mockResolvedValue(true);

    const { resolveLLM } = await import("@/lib/llm/router");
    const resolved = await resolveLLM("auto");

    expect(resolved.provider).toBe("local");
    expect(resolved.model).toBe("ollama-test");
  });

  it("falls back to hosted when local is unavailable in auto mode", async () => {
    localHealthy.mockResolvedValue(false);
    hostedHealthy.mockResolvedValue(true);

    const { resolveLLM } = await import("@/lib/llm/router");
    const resolved = await resolveLLM("auto");

    expect(resolved.provider).toBe("hosted");
    expect(resolved.model).toBe("claude-test");
  });

  it("returns provider unavailable when explicit provider is unhealthy", async () => {
    localHealthy.mockResolvedValue(false);
    hostedHealthy.mockResolvedValue(false);

    const { resolveLLM } = await import("@/lib/llm/router");

    await expect(resolveLLM("local")).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
    await expect(resolveLLM("hosted")).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
  });
});
