import { describe, expect, it } from "vitest";

import { buildPropagatedDecisionMap, buildSynthesisSummary } from "@/lib/analysis/propagation";
import { analyzeFramework, enforceFrameworkVisualizationIntegrity } from "@/lib/frameworks/analyzers";
import { inferDecisionThemeVector } from "@/lib/analysis/theme";
import { TOP12_VIZ_TYPE_BY_FRAMEWORK } from "@/lib/frameworks/visual-contracts";
import { TOP_12_DEEP_FRAMEWORK_IDS, type DecisionBrief, type FrameworkResult } from "@/lib/types";

const brief: DecisionBrief = {
  title: "Launch AI assistant into enterprise support",
  decisionStatement:
    "Decide whether to launch a decision-support assistant for enterprise support operations this quarter.",
  context:
    "The team has limited delivery capacity and a fixed quarterly target for reducing support handling time.",
  alternatives: ["Conservative pilot", "Phased rollout", "Full launch"],
  constraints: ["SOC2 compliance", "No headcount increase", "Q3 delivery window"],
  deadline: "2026-09-30",
  stakeholders: ["Support Ops", "Security", "Product Leadership", "Customer Success"],
  successCriteria: ["Reduce average handle time by 20%", "Increase first contact resolution by 10%"],
  riskTolerance: "medium",
  budget: "$180k",
  timeLimit: "12 weeks",
  assumptions: ["Existing data quality is sufficient", "Customers accept guided AI workflows"],
  openQuestions: ["Which segment should be piloted first?", "How much guardrailing is needed?"],
  executionSteps: [
    "Define pilot scope",
    "Build compliance controls",
    "Run simulation",
    "Launch limited beta",
    "Review KPI outcomes",
  ],
};

describe("analysis pipeline primitives", () => {
  it("produces deep and generic framework outputs", () => {
    const themes = inferDecisionThemeVector(brief);

    const deepResult = analyzeFramework("swot_analysis", brief, themes);
    const genericResult = analyzeFramework("role_playing_model", brief, themes);

    expect(deepResult.deepSupported).toBe(true);
    expect(deepResult.vizPayload.type).toBe("swot");

    expect(genericResult.deepSupported).toBe(false);
    expect(genericResult.insights.length).toBeGreaterThan(0);
    expect(genericResult.vizPayload.type).toBe("radar");
  });

  it("enforces canonical visual types for top-12 frameworks", () => {
    const themes = inferDecisionThemeVector(brief);

    for (const frameworkId of TOP_12_DEEP_FRAMEWORK_IDS) {
      const result = analyzeFramework(frameworkId, brief, themes);
      expect(result.vizPayload.type).toBe(TOP12_VIZ_TYPE_BY_FRAMEWORK[frameworkId]);
      expect(result.vizPayload.vizSchemaVersion).toBe(2);
    }
  });

  it("repairs malformed top-12 visual payloads", () => {
    const themes = inferDecisionThemeVector(brief);
    const malformed: FrameworkResult = {
      ...analyzeFramework("swot_analysis", brief, themes),
      vizPayload: {
        type: "quadrant",
        title: "Bad",
        data: {
          points: [],
        },
      },
    };

    const repaired = enforceFrameworkVisualizationIntegrity(malformed, brief, themes);
    expect(repaired.warning).toBeTruthy();
    expect(repaired.result.vizPayload.type).toBe("swot");
    expect(repaired.result.vizPayload.vizSchemaVersion).toBe(2);
  });

  it("builds propagated map and synthesis from framework results", () => {
    const themes = inferDecisionThemeVector(brief);

    const results = [
      analyzeFramework("swot_analysis", brief, themes),
      analyzeFramework("eisenhower_matrix", brief, themes),
      analyzeFramework("pareto_principle", brief, themes),
      analyzeFramework("role_playing_model", brief, themes),
      analyzeFramework("black_swan_model", brief, themes),
    ];

    const map = buildPropagatedDecisionMap(results);
    const synthesis = buildSynthesisSummary(brief, results, map);

    expect(map.nodes.length).toBe(5);
    expect(map.edges.length).toBeGreaterThan(0);
    expect(synthesis.topFrameworks.length).toBeGreaterThan(0);
    expect(synthesis.recommendedActions.length).toBeGreaterThan(0);
    expect(synthesis.decisionRecommendation?.recommendedOption).toBeTruthy();
    expect((synthesis.decisionRecommendation?.optionScores.length ?? 0) >= 2).toBe(true);
  });
});
