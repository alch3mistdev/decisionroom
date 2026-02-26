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

  it("retries once when first output is invalid and succeeds on second output", async () => {
    chatMock
      .mockResolvedValueOnce({
        message: {
          content: "I think you should ask about options and constraints.",
        },
      })
      .mockResolvedValueOnce({
        message: {
          content: JSON.stringify([
            { id: "q1", question: "What options are viable?", rationale: "Need options." },
            { id: "q2", question: "What constraints apply?", rationale: "Need constraints." },
            { id: "q3", question: "How is success measured?", rationale: "Need measurable success." },
          ]),
        },
      });

    const { OllamaAdapter } = await import("@/lib/llm/ollama-adapter");
    const adapter = new OllamaAdapter();

    const schema = z.array(
      z.object({
        id: z.string(),
        question: z.string(),
        rationale: z.string(),
      }),
    );

    const result = await adapter.generateJson({
      systemPrompt: "Generate clarification questions",
      userPrompt: "Decision input JSON",
      schema,
      temperature: 0.1,
    });

    expect(result).toHaveLength(3);
    expect(chatMock).toHaveBeenCalledTimes(2);
  });
});
