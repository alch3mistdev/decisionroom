import { beforeEach, describe, expect, it, vi } from "vitest";

import { ProviderUnavailableError } from "@/lib/errors";

const getDecisionWithLatestBrief = vi.fn();
const resolveLLM = vi.fn();
const createRun = vi.fn();
const enqueueAnalysisRun = vi.fn();

vi.mock("@/lib/decisions", () => ({
  getDecisionWithLatestBrief,
}));

vi.mock("@/lib/llm/router", () => ({
  resolveLLM,
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    analysisRun: {
      create: createRun,
    },
  },
}));

vi.mock("@/lib/analysis/runner", () => ({
  enqueueAnalysisRun,
}));

describe("POST /api/decisions/:id/analyze", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getDecisionWithLatestBrief.mockResolvedValue({
      id: "decision-1",
      briefs: [{ id: "brief-1" }],
    });
  });

  it("returns 503 when provider is unavailable", async () => {
    resolveLLM.mockRejectedValue(new ProviderUnavailableError("Provider is down"));

    const { POST } = await import("@/app/api/decisions/[id]/analyze/route");

    const response = await POST(
      new Request("http://localhost/api/decisions/decision-1/analyze", {
        method: "POST",
        body: JSON.stringify({
          providerPreference: "auto",
          frameworkIds: ["swot_analysis"],
        }),
      }),
      { params: Promise.resolve({ id: "decision-1" }) },
    );

    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.code).toBe("PROVIDER_UNAVAILABLE");
    expect(createRun).not.toHaveBeenCalled();
  });
});
