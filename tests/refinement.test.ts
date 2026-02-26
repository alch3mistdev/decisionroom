import { beforeEach, describe, expect, it, vi } from "vitest";

import { ModelOutputInvalidError } from "@/lib/errors";
import { resolveLLM } from "@/lib/llm/router";
import {
  generateClarificationQuestions,
  generateDecisionBrief,
  scoreDecisionBriefQuality,
  suggestClarificationAnswers,
} from "@/lib/refinement";
import type { ClarificationQuestion, CreateDecisionInput } from "@/lib/types";

const generateJson = vi.fn();

vi.mock("@/lib/llm/router", () => ({
  resolveLLM: vi.fn(async () => ({
    provider: "hosted",
    model: "claude-test",
    adapter: {
      name: "anthropic",
      model: "claude-test",
      isHealthy: async () => true,
      generateJson,
    },
  })),
}));

const input: CreateDecisionInput = {
  prompt: "Should we migrate our analytics stack to a lakehouse architecture in the next two quarters?",
  constraints: "No downtime for reporting",
  stakeholders: "Data Engineering, BI, Finance",
  successCriteria: "Cut query costs by 25%, improve dashboard latency",
  riskTolerance: "medium",
};

describe("refinement flow", () => {
  beforeEach(() => {
    generateJson.mockReset();
    vi.mocked(resolveLLM).mockReset();
    vi.mocked(resolveLLM).mockImplementation(async () => ({
      provider: "hosted",
      model: "claude-test",
      adapter: {
        name: "anthropic",
        model: "claude-test",
        isHealthy: async () => true,
        generateJson,
      },
    }));
  });

  it("generates clarification questions", async () => {
    generateJson.mockResolvedValue({
      questions: [
        { question: "What options are viable?" },
        { id: "constraints", question: "What constraints are hard?" },
        { question: "What KPI defines success?" },
      ],
    });

    const result = await generateClarificationQuestions(input, "auto");

    expect(result.questions.length).toBeGreaterThanOrEqual(3);
    expect(result.questions.length).toBeLessThanOrEqual(6);
    expect(result.questions[0].question.length).toBeGreaterThan(5);
    expect(result.questions.every((q) => q.id.length > 0)).toBe(true);
    expect(result.questions.every((q) => q.rationale.length > 0)).toBe(true);
  });

  it("recovers question generation when local model output is unrecoverably malformed", async () => {
    generateJson.mockRejectedValue(
      new ModelOutputInvalidError("Malformed output", { provider: "ollama" }),
    );

    const result = await generateClarificationQuestions(input, "auto");

    expect(result.fallback).toBe(true);
    expect(result.provider).toBe("heuristic_recovery");
    expect(result.questions.length).toBeGreaterThanOrEqual(3);
  });

  it("guarantees at least 3 fallback clarification questions even with complete intake", async () => {
    generateJson.mockRejectedValue(
      new ModelOutputInvalidError("Malformed output", { provider: "ollama" }),
    );

    const completeInput: CreateDecisionInput = {
      title: "Launch decision",
      prompt: "Should we launch the new workflow automation to all enterprise customers this quarter?",
      alternatives: "Pilot with 3 customers, phased rollout, full rollout",
      constraints: "No downtime, maintain compliance",
      deadline: "End of quarter",
      stakeholders: "Ops, Security, Product",
      successCriteria: "Reduce cycle time by 20%",
      riskTolerance: "medium",
      budget: "$200k",
      timeLimit: "12 weeks",
    };

    const result = await generateClarificationQuestions(completeInput, "auto");

    expect(result.fallback).toBe(true);
    expect(result.questions.length).toBeGreaterThanOrEqual(3);
  });

  it("fails over from local to hosted in auto mode before heuristic fallback", async () => {
    const localGenerate = vi
      .fn()
      .mockRejectedValue(new ModelOutputInvalidError("Malformed local output"));
    const hostedGenerate = vi.fn().mockResolvedValue({
      questions: [
        { id: "q1", question: "What options are viable?", rationale: "Need options." },
        { id: "q2", question: "What constraints apply?", rationale: "Need constraints." },
        { id: "q3", question: "How will success be measured?", rationale: "Need KPIs." },
      ],
    });
    vi.mocked(resolveLLM).mockImplementation(async (preference) => {
      if (preference === "auto" || preference === "local") {
        return {
          provider: "local",
          model: "llama3.2",
          adapter: {
            name: "ollama",
            model: "llama3.2",
            isHealthy: async () => true,
            generateJson: localGenerate,
          },
        };
      }

      return {
        provider: "hosted",
        model: "claude-test",
        adapter: {
          name: "anthropic",
          model: "claude-test",
          isHealthy: async () => true,
          generateJson: hostedGenerate,
        },
      };
    });

    const result = await generateClarificationQuestions(input, "auto");

    expect(result.fallback).toBe(false);
    expect(result.provider).toBe("hosted");
    expect(result.questions.length).toBeGreaterThanOrEqual(3);
    expect(hostedGenerate).toHaveBeenCalled();
  });

  it("builds a decision brief and quality score", async () => {
    generateJson.mockResolvedValue({
      title: "Lakehouse migration decision",
      decisionStatement:
        "Decide whether to migrate analytics stack to a lakehouse architecture in two quarters.",
      context: "Current stack is expensive and latency-sensitive; migration risk is moderate.",
      alternatives: ["Migrate now", "Phased migration", "Delay migration"],
      constraints: ["No reporting downtime"],
      deadline: "2026-06-30",
      stakeholders: ["Data Engineering", "BI", "Finance"],
      successCriteria: ["Cut query costs by 25%", "Improve dashboard latency"],
      riskTolerance: "medium",
      budget: "$120k",
      timeLimit: "2 quarters",
      assumptions: ["Data quality is sufficient", "Team capacity remains stable"],
      openQuestions: ["Which domain migrates first?"],
      executionSteps: ["Define scope", "Run pilot", "Scale rollout"],
    });

    const briefResult = await generateDecisionBrief(
      input,
      [
        { question: "What is the deadline?", answer: "Pilot in 8 weeks." },
        { question: "What budget is available?", answer: "$120k in FY26." },
      ],
      "auto",
    );

    const quality = scoreDecisionBriefQuality(briefResult.decisionBrief);

    expect(briefResult.decisionBrief.title.length).toBeGreaterThan(3);
    expect(briefResult.decisionBrief.executionSteps.length).toBeGreaterThan(0);
    expect(quality).toBeGreaterThan(0);
  });

  it("suggests rational autofill answers for clarification questions", async () => {
    const questions: ClarificationQuestion[] = [
      {
        id: "alternatives",
        question: "What are the top options you are considering?",
        rationale: "Need explicit options to compare.",
      },
      {
        id: "constraints",
        question: "What hard constraints cannot be violated?",
        rationale: "Constraint boundaries narrow the feasible set.",
      },
      {
        id: "success",
        question: "How will you define success?",
        rationale: "Decision quality requires measurable outcomes.",
      },
    ];

    generateJson.mockResolvedValue([
      { id: "alternatives", answer: "Evaluate phased pilot, full rollout, and delayed launch with KPI gates." },
      { id: "constraints", answer: "Maintain zero downtime, preserve compliance posture, and cap budget exposure." },
      { id: "success", answer: "Track cost reduction and latency improvement versus baseline targets." },
    ]);

    const suggestionResult = await suggestClarificationAnswers(input, questions, "auto");

    expect(suggestionResult.suggestions).toHaveLength(3);
    expect(suggestionResult.suggestions.every((item) => item.answer.trim().length > 20)).toBe(true);
    expect(
      suggestionResult.suggestions.every((item, index) => item.answer !== questions[index].question),
    ).toBe(true);
  });

  it("falls back to heuristic suggestions when model output is invalid", async () => {
    const questions: ClarificationQuestion[] = [
      {
        id: "alternatives",
        question: "What are the top options you are considering?",
        rationale: "Need explicit options to compare.",
      },
      {
        id: "constraints",
        question: "What hard constraints cannot be violated?",
        rationale: "Constraint boundaries narrow the feasible set.",
      },
      {
        id: "success",
        question: "How will you define success?",
        rationale: "Decision quality requires measurable outcomes.",
      },
    ];
    generateJson.mockRejectedValue(new ModelOutputInvalidError("Malformed suggestions"));

    const suggestionResult = await suggestClarificationAnswers(input, questions, "auto");

    expect(suggestionResult.fallback).toBe(true);
    expect(suggestionResult.provider).toBe("heuristic_recovery");
    expect(suggestionResult.suggestions).toHaveLength(3);
    expect(suggestionResult.suggestions.every((item) => item.answer.trim().length > 0)).toBe(true);
  });
});
