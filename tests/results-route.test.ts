import { beforeEach, describe, expect, it, vi } from "vitest";

const getDecisionWithLatestBrief = vi.fn();
const getLatestCompleteRun = vi.fn();

vi.mock("@/lib/decisions", () => ({
  getDecisionWithLatestBrief,
  getLatestCompleteRun,
}));

describe("GET /api/decisions/:id/results", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns synthesis warnings and per-framework generation metadata", async () => {
    getDecisionWithLatestBrief.mockResolvedValue({
      id: "decision-1",
      briefs: [
        {
          briefJson: {
            title: "Decision",
            decisionStatement: "Decision statement long enough for schema validation.",
            context: "Context long enough for schema validation requirements.",
            alternatives: ["Option A", "Option B"],
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
        },
      ],
    });

    getLatestCompleteRun.mockResolvedValue({
      id: "run-1",
      provider: "local",
      model: "ollama-test",
      propagatedMap: {
        nodes: [],
        edges: [],
        clusters: [],
        consensus: [],
        conflicts: [],
      },
      synthesis: {
        topFrameworks: [],
        contradictions: [],
        recommendedActions: [],
        checkpoints: [],
        warnings: [
          "SWOT (swot_analysis) fell back to deterministic analysis: invalid structured output.",
        ],
      },
      frameworkResults: [
        {
          resultJson: {
            frameworkId: "swot_analysis",
            frameworkName: "SWOT Analysis",
            applicabilityScore: 0.8,
            confidence: 0.7,
            insights: ["Insight 1"],
            actions: ["Action 1"],
            risks: ["Risk 1"],
            assumptions: ["Assumption 1"],
            themes: {
              risk: 0.5,
              urgency: 0.5,
              opportunity: 0.5,
              uncertainty: 0.5,
              resources: 0.5,
              stakeholderImpact: 0.5,
            },
            vizPayload: {
              type: "list",
              title: "List",
              data: [{ label: "Item", value: 1 }],
            },
            deepSupported: true,
            generation: {
              mode: "fallback",
              provider: "local",
              model: "ollama-test",
              warning:
                "SWOT (swot_analysis) fell back to deterministic analysis: invalid structured output.",
            },
          },
        },
      ],
    });

    const { GET } = await import("@/app/api/decisions/[id]/results/route");
    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ id: "decision-1" }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.synthesis.warnings).toHaveLength(1);
    expect(body.frameworkResults[0].generation.mode).toBe("fallback");
  });
});
