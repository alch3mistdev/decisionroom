import { describe, expect, it } from "vitest";

import { inferDecisionThemeVector } from "@/lib/analysis/theme";
import { buildCanonicalTop12Visualization } from "@/lib/frameworks/visual-builders";
import {
  TOP12_VIZ_TYPE_BY_FRAMEWORK,
  validateFrameworkViz,
} from "@/lib/frameworks/visual-contracts";
import { TOP_12_DEEP_FRAMEWORK_IDS, type DecisionBrief } from "@/lib/types";

const brief: DecisionBrief = {
  title: "AI assistant launch path",
  decisionStatement: "Choose launch sequencing for an enterprise AI assistant.",
  context:
    "The team has fixed quarter targets and must preserve customer trust while improving support throughput.",
  alternatives: ["Immediate launch", "Phased pilot", "Delay one quarter"],
  constraints: ["SOC2 compliance", "No support headcount increase", "CSAT cannot regress"],
  deadline: "End of quarter",
  stakeholders: ["Support", "Security", "Product", "Customer Success"],
  successCriteria: ["Improve handle time by 20%", "Increase first-contact resolution by 10%"],
  riskTolerance: "medium",
  budget: "$180k",
  timeLimit: "12 weeks",
  assumptions: ["Existing data quality is sufficient", "Pilot users will provide signal quickly"],
  openQuestions: ["How much guardrailing is required?", "Which segment starts first?"],
  executionSteps: ["Define pilot", "Implement safeguards", "Measure outcomes", "Scale rollout"],
};

describe("framework visual contracts", () => {
  it("accepts canonical payloads for every top-12 framework", () => {
    const themes = inferDecisionThemeVector(brief);

    for (const frameworkId of TOP_12_DEEP_FRAMEWORK_IDS) {
      const vizPayload = buildCanonicalTop12Visualization(frameworkId, brief, themes);
      const validation = validateFrameworkViz(frameworkId, vizPayload);

      expect(vizPayload.type).toBe(TOP12_VIZ_TYPE_BY_FRAMEWORK[frameworkId]);
      expect(validation.ok).toBe(true);
      expect(validation.issues).toHaveLength(0);
    }
  });

  it("rejects malformed top-12 payloads", () => {
    const malformed = {
      type: "quadrant" as const,
      title: "SWOT",
      vizSchemaVersion: 1,
      data: {
        kind: "swot_analysis",
        strengths: [],
      },
    };

    const validation = validateFrameworkViz("swot_analysis", malformed);
    expect(validation.ok).toBe(false);
    expect(validation.issues.length).toBeGreaterThan(0);
  });
});

