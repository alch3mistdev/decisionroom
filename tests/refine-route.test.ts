import { beforeEach, describe, expect, it, vi } from "vitest";

const getDecisionWithLatestBrief = vi.fn();
const saveClarificationAnswers = vi.fn();
const replaceClarificationQuestions = vi.fn();
const saveDecisionBrief = vi.fn();
const generateClarificationQuestions = vi.fn();
const suggestClarificationAnswers = vi.fn();
const generateDecisionBrief = vi.fn();
const scoreDecisionBriefQuality = vi.fn();

vi.mock("@/lib/decisions", () => ({
  getDecisionWithLatestBrief,
  saveClarificationAnswers,
  replaceClarificationQuestions,
  saveDecisionBrief,
}));

vi.mock("@/lib/refinement", () => ({
  generateClarificationQuestions,
  suggestClarificationAnswers,
  generateDecisionBrief,
  scoreDecisionBriefQuality,
}));

describe("POST /api/decisions/:id/refine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getDecisionWithLatestBrief.mockResolvedValue({
      id: "decision-1",
      rawInput: {
        prompt: "Should we launch this quarter with a phased rollout?",
      },
    });
  });

  it("supports sparse non-sequential answer ids by key", async () => {
    saveClarificationAnswers.mockResolvedValue({
      qaPairs: [
        { question: "Q2", answer: "A2" },
        { question: "Q3", answer: "A3" },
      ],
      unmatchedIds: [],
      generationId: "gen:1",
    });
    generateDecisionBrief.mockResolvedValue({
      decisionBrief: {
        title: "Decision",
        decisionStatement: "Decision statement",
        context: "Context text for the decision.",
        alternatives: ["A", "B"],
        constraints: ["No downtime"],
        deadline: "2026-12-01",
        stakeholders: ["Ops"],
        successCriteria: ["Latency < 1s"],
        riskTolerance: "medium",
        budget: "$100",
        timeLimit: "8 weeks",
        assumptions: ["Assumption 1", "Assumption 2"],
        openQuestions: ["Question?"],
        executionSteps: ["Step 1", "Step 2", "Step 3"],
      },
      provider: "hosted",
      model: "claude-test",
      fallback: false,
    });
    scoreDecisionBriefQuality.mockReturnValue(0.78);

    const { POST } = await import("@/app/api/decisions/[id]/refine/route");

    const response = await POST(
      new Request("http://localhost/api/decisions/decision-1/refine", {
        method: "POST",
        body: JSON.stringify({
          mode: "submit_answers",
          answers: [
            { id: "q_2", answer: "A2" },
            { id: "q_3", answer: "A3" },
          ],
        }),
      }),
      { params: Promise.resolve({ id: "decision-1" }) },
    );

    expect(response.status).toBe(200);
    expect(saveClarificationAnswers).toHaveBeenCalledWith("decision-1", [
      { id: "q_2", answer: "A2" },
      { id: "q_3", answer: "A3" },
    ]);
  });
});
