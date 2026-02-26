import { describe, expect, it } from "vitest";

import { parseJsonFromText } from "@/lib/utils/json";

describe("parseJsonFromText", () => {
  it("parses fenced JSON with single quotes and trailing commas", () => {
    const input = [
      "```json",
      "{",
      "  'questions': [",
      "    { 'id': 'q1', 'question': 'What are options?', 'rationale': 'Need options', },",
      "  ],",
      "}",
      "```",
    ].join("\n");

    const parsed = parseJsonFromText(input) as { questions: Array<{ id: string }> };
    expect(parsed.questions[0].id).toBe("q1");
  });
});
