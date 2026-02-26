import { beforeEach, describe, expect, it, vi } from "vitest";

const getDecisionWithLatestBrief = vi.fn();
const getLatestClarificationGeneration = vi.fn();
const getLatestRunSnapshot = vi.fn();

vi.mock("@/lib/decisions", () => ({
  getDecisionWithLatestBrief,
  getLatestClarificationGeneration,
  getLatestRunSnapshot,
}));

describe("GET /api/decisions/:id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns clarifications and latest run snapshot for resumable workflow", async () => {
    getDecisionWithLatestBrief.mockResolvedValue({
      id: "decision-1",
      title: "Decision",
      rawInput: {
        prompt: "Should we launch a phased pilot this quarter?",
      },
      createdAt: new Date("2026-02-01T00:00:00Z"),
      updatedAt: new Date("2026-02-02T00:00:00Z"),
      briefs: [
        {
          briefJson: {
            title: "Decision",
            decisionStatement: "Statement long enough for schema.",
            context: "Context long enough for schema validation.",
            alternatives: ["A", "B"],
            constraints: ["Constraint"],
            deadline: null,
            stakeholders: ["Ops"],
            successCriteria: ["KPI"],
            riskTolerance: "medium",
            budget: null,
            timeLimit: null,
            assumptions: ["Assumption 1", "Assumption 2"],
            openQuestions: ["Question"],
            executionSteps: ["Step 1", "Step 2", "Step 3"],
          },
          qualityScore: 0.71,
        },
      ],
    });

    getLatestClarificationGeneration.mockResolvedValue({
      generationId: "gen:1",
      questions: [
        {
          id: "q_1",
          question: "Q1",
          rationale: "R1",
          answer: "A1",
          status: "answered",
          sequence: 1,
        },
      ],
    });

    getLatestRunSnapshot.mockResolvedValue({
      runId: "run-1",
      decisionId: "decision-1",
      provider: "hosted",
      model: "claude-test",
      status: "analyzing",
      error: null,
      startedAt: "2026-02-02T01:00:00.000Z",
      endedAt: null,
      frameworkCount: 4,
      completedFrameworkCount: 1,
    });

    const { GET } = await import("@/app/api/decisions/[id]/route");
    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ id: "decision-1" }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.clarifications.generationId).toBe("gen:1");
    expect(body.latestRun.status).toBe("analyzing");
    expect(body.briefQualityScore).toBe(0.71);
  });
});
