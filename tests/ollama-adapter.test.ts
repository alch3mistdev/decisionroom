import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const chatMock = vi.fn();
const listMock = vi.fn();
const OllamaCtorMock = vi.fn(function OllamaMock(this: { chat: typeof chatMock; list: typeof listMock }) {
  this.chat = chatMock;
  this.list = listMock;
});

vi.mock("ollama", () => ({
  Ollama: OllamaCtorMock,
}));

describe("OllamaAdapter", () => {
  beforeEach(() => {
    vi.resetModules();
    chatMock.mockReset();
    listMock.mockReset();
    OllamaCtorMock.mockClear();
  });

  it("uses schema-constrained format and retries once when first output is invalid", async () => {
    chatMock
      .mockResolvedValueOnce({
        message: {
          content: "I think you should ask about options and constraints.",
        },
      })
      .mockResolvedValueOnce({
        message: {
          content: JSON.stringify({
            questions: [
              { id: "q1", question: "What options are viable?", rationale: "Need options." },
            ],
          }),
        },
      });

    const { OllamaAdapter } = await import("@/lib/llm/ollama-adapter");
    const adapter = new OllamaAdapter();

    const schema = z.object({
      questions: z.array(
        z.object({
          id: z.string(),
          question: z.string(),
          rationale: z.string(),
        }),
      ),
    });

    const result = await adapter.generateJson({
      systemPrompt: "Generate clarification questions",
      userPrompt: "Decision input JSON",
      schema,
      temperature: 0.1,
    });

    expect(result.questions).toHaveLength(1);
    expect(chatMock).toHaveBeenCalledTimes(2);
    expect(typeof chatMock.mock.calls[0][0].format).toBe("object");
  });

  it("repairs incomplete JSON structure without retry when possible", async () => {
    chatMock.mockResolvedValueOnce({
      message: {
        content: '{"questions":[{"id":"q1","question":"What options are viable?","rationale":"Need options."}]',
      },
    });

    const { OllamaAdapter } = await import("@/lib/llm/ollama-adapter");
    const adapter = new OllamaAdapter();
    const schema = z.object({
      questions: z.array(
        z.object({
          id: z.string(),
          question: z.string(),
          rationale: z.string(),
        }),
      ),
    });

    const result = await adapter.generateJson({
      systemPrompt: "Generate clarification questions",
      userPrompt: "Decision input JSON",
      schema,
    });

    expect(result.questions[0].id).toBe("q1");
    expect(chatMock).toHaveBeenCalledTimes(1);
  });

  it("throws MODEL_OUTPUT_INVALID after retry exhaustion", async () => {
    chatMock
      .mockResolvedValueOnce({
        message: {
          content: "not valid",
        },
      })
      .mockResolvedValueOnce({
        message: {
          content: "still not valid",
        },
      });

    const { OllamaAdapter } = await import("@/lib/llm/ollama-adapter");
    const adapter = new OllamaAdapter();
    const schema = z.object({ ok: z.boolean() });

    await expect(
      adapter.generateJson({
        systemPrompt: "Return object",
        userPrompt: "Return object",
        schema,
      }),
    ).rejects.toMatchObject({ code: "MODEL_OUTPUT_INVALID" });
    expect(chatMock).toHaveBeenCalledTimes(2);
  });
});
