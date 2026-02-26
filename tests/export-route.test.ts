import { beforeEach, describe, expect, it, vi } from "vitest";

const getDecisionWithLatestBrief = vi.fn();
const getLatestCompleteRun = vi.fn();
const buildMarkdownExport = vi.fn();
const buildZipExportBundle = vi.fn();
const deleteMany = vi.fn();
const createMany = vi.fn();

vi.mock("@/lib/decisions", () => ({
  getDecisionWithLatestBrief,
  getLatestCompleteRun,
}));

vi.mock("@/lib/export/bundle", () => ({
  buildMarkdownExport,
  buildZipExportBundle,
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    $transaction: async (callback: (tx: unknown) => Promise<void>) =>
      callback({
        exportArtifact: {
          deleteMany,
          createMany,
        },
      }),
  },
}));

describe("GET /api/decisions/:id/export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getDecisionWithLatestBrief.mockResolvedValue({
      id: "decision-1",
      briefs: [
        {
          briefJson: {
            title: "Decision",
            decisionStatement: "Decision statement long enough.",
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
        },
      ],
    });
    getLatestCompleteRun.mockResolvedValue({
      id: "run-1",
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
      },
      frameworkResults: [],
    });
    buildMarkdownExport.mockReturnValue({
      markdown: "# report",
      artifacts: [{ type: "markdown", path: "decision-decision-1/report.md", checksum: "abc" }],
    });
  });

  it("uses markdown path without building zip bundle", async () => {
    const { GET } = await import("@/app/api/decisions/[id]/export/route");

    const response = await GET(
      new Request("http://localhost/api/decisions/decision-1/export?format=md"),
      { params: Promise.resolve({ id: "decision-1" }) },
    );

    expect(response.status).toBe(200);
    expect(buildMarkdownExport).toHaveBeenCalledTimes(1);
    expect(buildZipExportBundle).not.toHaveBeenCalled();
    expect(createMany).toHaveBeenCalledTimes(1);
    expect(response.headers.get("content-type")).toContain("text/markdown");
  });
});
