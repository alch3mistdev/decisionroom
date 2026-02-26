import { describe, expect, it } from "vitest";

import { inferDecisionThemeVector } from "@/lib/analysis/theme";
import { buildCanonicalTop12Visualization } from "@/lib/frameworks/visual-builders";
import { TOP_12_DEEP_FRAMEWORK_IDS, type DecisionBrief } from "@/lib/types";

const brief: DecisionBrief = {
  title: "Support assistant rollout",
  decisionStatement: "Decide between pilot, phased launch, or delayed launch of support automation.",
  context:
    "Capacity is fixed and leadership wants measurable upside without trust regressions or compliance risk.",
  alternatives: ["Pilot with design partners", "Phased launch", "Delay quarter"],
  constraints: ["SOC2 control hardening", "No headcount increase", "Customer trust must hold"],
  deadline: "Q3 end",
  stakeholders: ["Support leadership", "Security", "Product", "Enterprise success"],
  successCriteria: ["20% handle-time reduction", "10% FCR improvement", "No CSAT regression"],
  riskTolerance: "medium",
  budget: "$180k",
  timeLimit: "12 weeks",
  assumptions: ["Data quality remains stable", "Customers accept guided workflows"],
  openQuestions: ["Segment ordering", "Guardrail strictness"],
  executionSteps: ["Define scope", "Build controls", "Run pilot", "Review KPIs", "Scale rollout"],
};

describe("canonical visual builders", () => {
  it("returns deterministic top-12 payloads", () => {
    const themes = inferDecisionThemeVector(brief);

    for (const frameworkId of TOP_12_DEEP_FRAMEWORK_IDS) {
      const first = buildCanonicalTop12Visualization(frameworkId, brief, themes);
      const second = buildCanonicalTop12Visualization(frameworkId, brief, themes);

      expect(first).toEqual(second);
      expect(first.vizSchemaVersion).toBe(2);
      expect(typeof first.title).toBe("string");
      expect(first.title.length).toBeGreaterThan(0);
    }
  });
});

