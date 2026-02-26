import { describe, expect, it } from "vitest";

import { pairClarificationAnswers } from "@/lib/decisions";

describe("clarification answer pairing", () => {
  it("pairs by question key and reports unmatched ids", () => {
    const questions = [
      {
        id: "db-1",
        question: "What are top options?",
        questionKey: "alternatives",
        generationId: "gen:1",
        sequence: 1,
        answer: null,
        status: "pending",
      },
      {
        id: "db-2",
        question: "What constraints apply?",
        questionKey: "constraints",
        generationId: "gen:1",
        sequence: 2,
        answer: null,
        status: "pending",
      },
    ];

    const result = pairClarificationAnswers(questions, [
      { id: "constraints", answer: "No downtime." },
      { id: "missing", answer: "ignored" },
    ]);

    expect(result.paired).toEqual([
      {
        id: "db-2",
        question: "What constraints apply?",
        answer: "No downtime.",
      },
    ]);
    expect(result.unmatchedIds).toEqual(["missing"]);
  });
});
