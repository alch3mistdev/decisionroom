import { describe, expect, it } from "vitest";

import { inferDecisionThemeVector } from "@/lib/analysis/theme";
import { scoreTop12Representation } from "@/lib/frameworks/representation-rubric";
import { buildCanonicalTop12Visualization } from "@/lib/frameworks/visual-builders";
import { validateFrameworkViz } from "@/lib/frameworks/visual-contracts";
import { TOP_12_DEEP_FRAMEWORK_IDS, type DecisionBrief, type Top12VisualizationData } from "@/lib/types";

const brief: DecisionBrief = {
  title: "Enterprise support AI launch",
  decisionStatement:
    "Decide whether to launch fully, run a phased pilot, or delay launch while preserving compliance and trust.",
  context:
    "Leadership needs measurable support gains this quarter, but SOC2 and customer trust cannot regress.",
  alternatives: [
    "Launch AI support assistant to all enterprise customers",
    "Run a phased pilot with 3 design partners",
    "Delay launch by one quarter for reliability hardening",
  ],
  constraints: [
    "SOC2 Type II compliance is mandatory",
    "No support headcount increase",
    "CSAT must not regress beyond 5 points",
  ],
  deadline: "End of quarter",
  stakeholders: ["Support", "Security", "Product", "Customer Success"],
  successCriteria: [
    "Reduce average handle time by 20%",
    "Increase first-contact resolution by 10%",
    "Protect CSAT with no more than 5-point temporary drop",
  ],
  riskTolerance: "medium",
  budget: "$180k",
  timeLimit: "12 weeks",
  assumptions: [
    "Current 85-90% accuracy is representative of production quality",
    "Feature rollback can be completed in under 24 hours",
  ],
  openQuestions: [
    "Which enterprise segments should adopt first?",
    "What reliability threshold is acceptable before broad rollout?",
  ],
  executionSteps: [
    "Confirm SOC2 Type II audit completion",
    "Validate feature rollback and kill switch",
    "Run pilot with design partners",
    "Train 500+ enterprise scenarios",
    "Scale rollout with guarded monitoring",
  ],
};

describe("top-12 representation rubric", () => {
  it("scores canonical payloads above rubric threshold", () => {
    const themes = inferDecisionThemeVector(brief);

    for (const frameworkId of TOP_12_DEEP_FRAMEWORK_IDS) {
      const vizPayload = buildCanonicalTop12Visualization(frameworkId, brief, themes);
      const validation = validateFrameworkViz(frameworkId, vizPayload);

      expect(validation.ok).toBe(true);
      expect(validation.rubric).toBeDefined();
      expect(validation.rubric?.passed).toBe(true);
      expect(validation.rubric?.score ?? 0).toBeGreaterThanOrEqual(validation.rubric?.passThreshold ?? 0.85);

      const report = scoreTop12Representation(frameworkId, vizPayload.data as Top12VisualizationData);
      expect(report.passed).toBe(true);
    }
  });

  it("uses corrected portfolio quadrant labels", () => {
    const themes = inferDecisionThemeVector(brief);
    const vizPayload = buildCanonicalTop12Visualization("project_portfolio_matrix", brief, themes);
    const data = vizPayload.data as Top12VisualizationData & {
      kind: "project_portfolio_matrix";
      quadrants: Record<string, string>;
    };

    expect(data.quadrants.topLeft).toContain("High Value, Low Risk");
    expect(data.quadrants.bottomRight).toContain("Low Value, High Risk");
  });

  it("uses canonical chasm segment distribution", () => {
    const themes = inferDecisionThemeVector(brief);
    const vizPayload = buildCanonicalTop12Visualization("chasm_diffusion_model", brief, themes);
    const data = vizPayload.data as Top12VisualizationData & {
      kind: "chasm_diffusion_model";
      segments: Array<{ segment: string; adoption: number }>;
      chasmAfter: string;
      gap: number;
    };

    const expectedSegments = [
      "Innovators",
      "Early Adopters",
      "Early Majority",
      "Late Majority",
      "Laggards",
    ];

    expect(data.segments.map((segment) => segment.segment)).toEqual(expectedSegments);
    expect(data.chasmAfter).toBe("Early Adopters");

    const sum = data.segments.reduce((acc, segment) => acc + segment.adoption, 0);
    expect(sum).toBeCloseTo(1, 5);
    expect(data.gap).toBeGreaterThan(0);
  });

  it("includes third-order consequences and Monte Carlo metadata", () => {
    const themes = inferDecisionThemeVector(brief);
    const consequences = buildCanonicalTop12Visualization("consequences_model", brief, themes)
      .data as Top12VisualizationData & {
      kind: "consequences_model";
      horizons: Array<{ thirdOrder?: number }>;
    };
    const monteCarlo = buildCanonicalTop12Visualization("monte_carlo_simulation", brief, themes)
      .data as Top12VisualizationData & {
      kind: "monte_carlo_simulation";
      metadata?: { trials: number; distribution: string; correlationMode: string };
    };

    expect(consequences.horizons.every((horizon) => typeof horizon.thirdOrder === "number")).toBe(true);
    expect(monteCarlo.metadata).toBeDefined();
    expect(monteCarlo.metadata?.trials).toBeGreaterThan(0);
    expect(monteCarlo.metadata?.distribution).toContain("gaussian");
  });
});
