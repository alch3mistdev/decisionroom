import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FrameworkId, FrameworkResult } from "@/lib/types";

const frameworkDefinitionUpsert = vi.fn();
const findRunMock = vi.fn();
const updateRunMock = vi.fn();
const upsertFrameworkResultMock = vi.fn();
const deleteMapEdgeMock = vi.fn();
const createMapEdgeMock = vi.fn();
const txRunUpdateMock = vi.fn();
const transactionMock = vi.fn();

const analyzeFrameworkWithLLMMock = vi.fn();
const analyzeFrameworkSimulationMock = vi.fn();
const enforceFrameworkVisualizationIntegrityMock = vi.fn();
const resolveLLMMock = vi.fn();
const getAdapterForResolvedProviderMock = vi.fn();

let frameworkDefinitions: Array<{
  id: FrameworkId;
  name: string;
  category: string;
  maturity: "core" | "exploratory";
  deepSupported: boolean;
  description: string;
}> = [];

vi.mock("@/lib/db", () => ({
  prisma: {
    $transaction: (...args: unknown[]) => transactionMock(...args),
    frameworkDefinition: {
      upsert: (...args: unknown[]) => frameworkDefinitionUpsert(...args),
    },
    analysisRun: {
      findUnique: (...args: unknown[]) => findRunMock(...args),
      update: (...args: unknown[]) => updateRunMock(...args),
    },
    frameworkResultRecord: {
      upsert: (...args: unknown[]) => upsertFrameworkResultMock(...args),
    },
  },
}));

vi.mock("@/lib/frameworks/analyzers", () => ({
  analyzeFrameworkWithLLM: (...args: unknown[]) => analyzeFrameworkWithLLMMock(...args),
  analyzeFrameworkSimulation: (...args: unknown[]) => analyzeFrameworkSimulationMock(...args),
  enforceFrameworkVisualizationIntegrity: (...args: unknown[]) =>
    enforceFrameworkVisualizationIntegrityMock(...args),
}));

vi.mock("@/lib/frameworks/registry", () => ({
  listFrameworkDefinitions: () => frameworkDefinitions,
  getFrameworkDefinition: (frameworkId: FrameworkId) => {
    const found = frameworkDefinitions.find((framework) => framework.id === frameworkId);
    if (!found) {
      throw new Error(`Missing framework definition ${frameworkId}`);
    }

    return {
      ...found,
      promptTemplate: "",
      themeWeights: {
        risk: 0.6,
        urgency: 0.6,
        opportunity: 0.6,
        uncertainty: 0.6,
        resources: 0.6,
        stakeholderImpact: 0.6,
      },
    };
  },
}));

vi.mock("@/lib/llm/router", () => ({
  resolveLLM: (...args: unknown[]) => resolveLLMMock(...args),
  getAdapterForResolvedProvider: (...args: unknown[]) =>
    getAdapterForResolvedProviderMock(...args),
}));

function validBrief() {
  return {
    title: "Decision",
    decisionStatement: "Decide whether to launch a phased support pilot this quarter.",
    context: "Long enough context to satisfy validation requirements for decision brief parsing.",
    alternatives: ["Pilot", "Delay"],
    constraints: ["No downtime"],
    deadline: "2026-09-30",
    stakeholders: ["Ops", "Support"],
    successCriteria: ["KPI lift"],
    riskTolerance: "medium" as const,
    budget: "$100k",
    timeLimit: "12 weeks",
    assumptions: ["Assumption 1", "Assumption 2"],
    openQuestions: ["Open question"],
    executionSteps: ["Step 1", "Step 2", "Step 3"],
  };
}

function llmResult(frameworkId: FrameworkId): FrameworkResult {
  return {
    frameworkId,
    frameworkName: frameworkId,
    applicabilityScore: 0.8,
    confidence: 0.75,
    insights: ["Insight 1", "Insight 2", "Insight 3"],
    actions: ["Action 1", "Action 2", "Action 3"],
    risks: ["Risk 1", "Risk 2"],
    assumptions: ["Assumption 1", "Assumption 2"],
    themes: {
      risk: 0.5,
      urgency: 0.5,
      opportunity: 0.6,
      uncertainty: 0.4,
      resources: 0.5,
      stakeholderImpact: 0.6,
    },
    vizPayload: {
      type: "list",
      title: "Viz",
      data: [],
    },
    deepSupported: true,
    generation: {
      mode: "llm",
      provider: "local",
      model: "ollama-test",
    },
  };
}

function fallbackResult(frameworkId: FrameworkId, warning?: string): FrameworkResult {
  return {
    ...llmResult(frameworkId),
    generation: {
      mode: "fallback",
      provider: "local",
      model: "ollama-test",
      warning,
    },
  };
}

async function waitForCondition(condition: () => boolean, timeoutMs = 3000) {
  const started = Date.now();
  while (!condition()) {
    if (Date.now() - started > timeoutMs) {
      throw new Error("Timed out waiting for condition");
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe("analysis runner", () => {
  beforeEach(() => {
    vi.resetModules();
    frameworkDefinitionUpsert.mockReset().mockResolvedValue(undefined);
    findRunMock.mockReset();
    updateRunMock.mockReset().mockResolvedValue(undefined);
    upsertFrameworkResultMock.mockReset().mockResolvedValue(undefined);
    deleteMapEdgeMock.mockReset().mockResolvedValue(undefined);
    createMapEdgeMock.mockReset().mockResolvedValue(undefined);
    txRunUpdateMock.mockReset().mockResolvedValue(undefined);
    transactionMock.mockReset().mockImplementation(async (arg: unknown) => {
      if (Array.isArray(arg)) {
        return Promise.all(arg);
      }
      if (typeof arg === "function") {
        return arg({
          mapEdgeRecord: {
            deleteMany: deleteMapEdgeMock,
            createMany: createMapEdgeMock,
          },
          analysisRun: {
            update: txRunUpdateMock,
          },
        });
      }
      throw new Error("Unsupported transaction usage");
    });
    analyzeFrameworkWithLLMMock.mockReset();
    analyzeFrameworkSimulationMock.mockReset();
    enforceFrameworkVisualizationIntegrityMock.mockReset().mockImplementation((result: FrameworkResult) => ({
      result,
    }));
    resolveLLMMock.mockReset();
    getAdapterForResolvedProviderMock.mockReset().mockReturnValue({
      provider: "local",
      model: "ollama-test",
      adapter: { name: "ollama", model: "ollama-test", isHealthy: async () => true, generateJson: vi.fn() },
    });

    findRunMock.mockResolvedValue({
      id: "run-1",
      decisionId: "decision-1",
      provider: "local",
      model: "ollama-test",
      frameworkIds: [],
      decision: {
        briefs: [{ briefJson: validBrief() }],
      },
    });
  });

  it("respects ANALYSIS_MAX_CONCURRENCY when running framework LLM analysis", async () => {
    process.env.ANALYSIS_MAX_CONCURRENCY = "2";
    process.env.ANALYSIS_LLM_SCOPE = "all";

    frameworkDefinitions = [
      { id: "swot_analysis", name: "SWOT", category: "strategy", maturity: "core", deepSupported: true, description: "desc" },
      { id: "eisenhower_matrix", name: "Eisenhower", category: "prioritization", maturity: "core", deepSupported: true, description: "desc" },
      { id: "bcg_matrix", name: "BCG", category: "portfolio", maturity: "core", deepSupported: true, description: "desc" },
      { id: "pareto_principle", name: "Pareto", category: "strategy", maturity: "core", deepSupported: true, description: "desc" },
    ];
    findRunMock.mockResolvedValueOnce({
      id: "run-1",
      decisionId: "decision-1",
      provider: "local",
      model: "ollama-test",
      frameworkIds: frameworkDefinitions.map((framework) => framework.id),
      decision: {
        briefs: [{ briefJson: validBrief() }],
      },
    });

    let inFlight = 0;
    let maxInFlight = 0;
    analyzeFrameworkWithLLMMock.mockImplementation(async (frameworkId: FrameworkId) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 25));
      inFlight -= 1;
      return llmResult(frameworkId);
    });
    analyzeFrameworkSimulationMock.mockImplementation((frameworkId: FrameworkId) =>
      fallbackResult(frameworkId),
    );

    const { enqueueAnalysisRun } = await import("@/lib/analysis/runner");
    await enqueueAnalysisRun("run-1");
    await waitForCondition(() =>
      txRunUpdateMock.mock.calls.some((call) => call[0].data.status === "complete"),
    );

    expect(maxInFlight).toBeLessThanOrEqual(2);
    expect(analyzeFrameworkWithLLMMock).toHaveBeenCalledTimes(4);
    expect(analyzeFrameworkSimulationMock).not.toHaveBeenCalled();
  });

  it("uses deep-only LLM scope by default and simulates non-deep frameworks", async () => {
    process.env.ANALYSIS_MAX_CONCURRENCY = "4";
    process.env.ANALYSIS_LLM_SCOPE = "deep_only";

    frameworkDefinitions = [
      { id: "swot_analysis", name: "SWOT", category: "strategy", maturity: "core", deepSupported: true, description: "desc" },
      { id: "role_playing_model", name: "Role Playing", category: "team", maturity: "exploratory", deepSupported: false, description: "desc" },
    ];
    findRunMock.mockResolvedValueOnce({
      id: "run-1",
      decisionId: "decision-1",
      provider: "local",
      model: "ollama-test",
      frameworkIds: frameworkDefinitions.map((framework) => framework.id),
      decision: {
        briefs: [{ briefJson: validBrief() }],
      },
    });

    analyzeFrameworkWithLLMMock.mockImplementation(async (frameworkId: FrameworkId) =>
      llmResult(frameworkId),
    );
    analyzeFrameworkSimulationMock.mockImplementation((frameworkId: FrameworkId) =>
      fallbackResult(frameworkId),
    );

    const { enqueueAnalysisRun } = await import("@/lib/analysis/runner");
    await enqueueAnalysisRun("run-1");
    await waitForCondition(() =>
      txRunUpdateMock.mock.calls.some((call) => call[0].data.status === "complete"),
    );

    expect(analyzeFrameworkWithLLMMock).toHaveBeenCalledTimes(1);
    expect(analyzeFrameworkWithLLMMock).toHaveBeenCalledWith(
      "swot_analysis",
      expect.any(Object),
      expect.any(Object),
      expect.any(Object),
    );
    expect(analyzeFrameworkSimulationMock).toHaveBeenCalledTimes(1);
    expect(analyzeFrameworkSimulationMock).toHaveBeenCalledWith(
      "role_playing_model",
      expect.any(Object),
      expect.any(Object),
    );
  });

  it("fails over to hosted provider before deterministic fallback", async () => {
    process.env.ANALYSIS_MAX_CONCURRENCY = "3";
    process.env.ANALYSIS_LLM_SCOPE = "all";

    frameworkDefinitions = [
      { id: "swot_analysis", name: "SWOT", category: "strategy", maturity: "core", deepSupported: true, description: "desc" },
      { id: "eisenhower_matrix", name: "Eisenhower", category: "prioritization", maturity: "core", deepSupported: true, description: "desc" },
    ];
    findRunMock.mockResolvedValueOnce({
      id: "run-1",
      decisionId: "decision-1",
      provider: "local",
      model: "ollama-test",
      frameworkIds: frameworkDefinitions.map((framework) => framework.id),
      decision: {
        briefs: [{ briefJson: validBrief() }],
      },
    });

    const { ModelOutputInvalidError } = await import("@/lib/errors");
    analyzeFrameworkWithLLMMock.mockImplementation(
      async (
        frameworkId: FrameworkId,
        _brief: unknown,
        _themes: unknown,
        llm: { provider: string; model: string },
      ) => {
        if (frameworkId === "swot_analysis" && llm.provider === "local") {
          throw new ModelOutputInvalidError("Invalid local JSON");
        }

        return {
          ...llmResult(frameworkId),
          generation: {
            mode: "llm",
            provider: llm.provider,
            model: llm.model,
          },
        };
      },
    );
    resolveLLMMock.mockImplementation(async (preference: string) => {
      if (preference === "hosted") {
        return {
          provider: "hosted",
          model: "claude-test",
          adapter: { name: "anthropic", model: "claude-test", isHealthy: async () => true, generateJson: vi.fn() },
        };
      }

      throw new Error(`Unexpected preference ${preference}`);
    });

    const { enqueueAnalysisRun } = await import("@/lib/analysis/runner");
    await enqueueAnalysisRun("run-1");
    await waitForCondition(() =>
      txRunUpdateMock.mock.calls.some((call) => call[0].data.status === "complete"),
    );

    expect(analyzeFrameworkSimulationMock).not.toHaveBeenCalled();
    const finalUpdateCall = txRunUpdateMock.mock.calls.at(-1);
    expect(finalUpdateCall?.[0].data.status).toBe("complete");
    expect(finalUpdateCall?.[0].data.synthesis.warnings).toBeDefined();
    expect(finalUpdateCall?.[0].data.synthesis.warnings[0]).toContain("recovered on hosted");
  });

  it("falls back per framework on model-output failure and still completes run with warnings", async () => {
    process.env.ANALYSIS_MAX_CONCURRENCY = "3";
    process.env.ANALYSIS_LLM_SCOPE = "all";

    frameworkDefinitions = [
      { id: "swot_analysis", name: "SWOT", category: "strategy", maturity: "core", deepSupported: true, description: "desc" },
      { id: "eisenhower_matrix", name: "Eisenhower", category: "prioritization", maturity: "core", deepSupported: true, description: "desc" },
    ];
    findRunMock.mockResolvedValueOnce({
      id: "run-1",
      decisionId: "decision-1",
      provider: "local",
      model: "ollama-test",
      frameworkIds: frameworkDefinitions.map((framework) => framework.id),
      decision: {
        briefs: [{ briefJson: validBrief() }],
      },
    });

    const { ModelOutputInvalidError } = await import("@/lib/errors");
    analyzeFrameworkWithLLMMock.mockImplementation(async (frameworkId: FrameworkId) => {
      if (frameworkId === "swot_analysis") {
        throw new ModelOutputInvalidError("Invalid JSON");
      }
      return llmResult(frameworkId);
    });
    analyzeFrameworkSimulationMock.mockImplementation(
      (frameworkId: FrameworkId, _brief: unknown, _themes: unknown, options?: { warning?: string }) =>
        fallbackResult(frameworkId, options?.warning),
    );

    const { enqueueAnalysisRun } = await import("@/lib/analysis/runner");
    await enqueueAnalysisRun("run-1");
    await waitForCondition(() =>
      txRunUpdateMock.mock.calls.some((call) => call[0].data.status === "complete"),
    );

    expect(analyzeFrameworkSimulationMock).toHaveBeenCalledTimes(1);
    const finalUpdateCall = txRunUpdateMock.mock.calls.at(-1);
    expect(finalUpdateCall?.[0].data.status).toBe("complete");
    expect(finalUpdateCall?.[0].data.synthesis.warnings).toBeDefined();
    expect(finalUpdateCall?.[0].data.synthesis.warnings[0]).toContain("fell back");
    expect(
      updateRunMock.mock.calls.some((call) => call[0].data.status === "failed"),
    ).toBe(false);
  });
});
