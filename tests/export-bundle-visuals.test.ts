import { describe, expect, it } from "vitest";

import { inferDecisionThemeVector } from "@/lib/analysis/theme";
import { renderFrameworkAssetSvg } from "@/lib/export/bundle";
import { buildCanonicalTop12Visualization } from "@/lib/frameworks/visual-builders";
import type { DecisionBrief, FrameworkResult } from "@/lib/types";

const brief: DecisionBrief = {
  title: "Launch decision",
  decisionStatement: "Choose launch sequencing for support automation.",
  context: "Need measurable upside with bounded risk and strong stakeholder trust.",
  alternatives: ["Pilot", "Phased launch", "Delay"],
  constraints: ["Compliance", "No headcount increase"],
  deadline: "Q3",
  stakeholders: ["Support", "Security", "Product"],
  successCriteria: ["20% handle-time reduction"],
  riskTolerance: "medium",
  budget: "$180k",
  timeLimit: "12 weeks",
  assumptions: ["Data quality stays stable"],
  openQuestions: ["Segment priority"],
  executionSteps: ["Define scope", "Run pilot", "Scale"],
};

function makeResult(overrides: Partial<FrameworkResult> & { vizPayload: FrameworkResult["vizPayload"] }): FrameworkResult {
  return {
    frameworkId: "bcg_matrix",
    frameworkName: "BCG Matrix",
    applicabilityScore: 0.81,
    confidence: 0.77,
    insights: ["Insight"],
    actions: ["Action"],
    risks: ["Risk"],
    assumptions: ["Assumption"],
    themes: {
      risk: 0.5,
      urgency: 0.55,
      opportunity: 0.72,
      uncertainty: 0.48,
      resources: 0.57,
      stakeholderImpact: 0.61,
    },
    deepSupported: true,
    ...overrides,
  };
}

describe("export framework svg rendering", () => {
  it("uses canonical svg generation for top-12 frameworks", () => {
    const themes = inferDecisionThemeVector(brief);
    const vizPayload = buildCanonicalTop12Visualization("bcg_matrix", brief, themes);

    const svg = renderFrameworkAssetSvg(
      makeResult({
        frameworkId: "bcg_matrix",
        frameworkName: "BCG Matrix",
        vizPayload,
      }),
    );

    expect(svg).toContain("Growth / Share Matrix");
    expect(svg).not.toContain("DecisionRoom Framework Snapshot");
  });

  it("keeps generic card fallback for non-top-12 frameworks", () => {
    const svg = renderFrameworkAssetSvg(
      makeResult({
        frameworkId: "role_playing_model",
        frameworkName: "Role-Playing Model",
        deepSupported: false,
        vizPayload: {
          type: "radar",
          title: "Generic",
          data: [],
        },
      }),
    );

    expect(svg).toContain("DecisionRoom Framework Snapshot");
  });
});

