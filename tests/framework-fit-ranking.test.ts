import { describe, expect, it } from "vitest";

import { rankFrameworkFitsForBrief } from "@/lib/frameworks/fit-ranking";
import { listFrameworkDefinitions } from "@/lib/frameworks/registry";
import type { DecisionBrief, FrameworkDefinition } from "@/lib/types";

const brief: DecisionBrief = {
  title: "AI assistant rollout",
  decisionStatement:
    "Should we launch the AI assistant now or phase rollout after additional reliability hardening?",
  context:
    "Enterprise rollout must balance growth upside with compliance and operational risk under a quarter deadline.",
  alternatives: ["Full rollout", "Phased pilot", "Delay launch"],
  constraints: ["No compliance regressions", "No support headcount increase"],
  deadline: "End of quarter",
  stakeholders: ["Support", "Security", "Product"],
  successCriteria: ["Improve first-contact resolution", "Reduce handle time"],
  riskTolerance: "medium",
  budget: "$180k",
  timeLimit: "12 weeks",
  assumptions: ["LLM quality remains stable", "Pilot customers provide fast feedback"],
  openQuestions: ["How quickly can we remediate false positives?"],
  executionSteps: ["Finalize scope", "Run pilot", "Gate full rollout"],
};

describe("framework fit ranking", () => {
  it("returns bounded fit scores for all ranked frameworks", () => {
    const ranked = rankFrameworkFitsForBrief(brief, listFrameworkDefinitions());

    expect(ranked.length).toBe(listFrameworkDefinitions().length);
    expect(ranked.every((framework) => framework.fitScore >= 0 && framework.fitScore <= 1)).toBe(true);
    expect(ranked[0]?.rank).toBe(1);
  });

  it("sorts frameworks by descending fit score", () => {
    const ranked = rankFrameworkFitsForBrief(brief, listFrameworkDefinitions());

    for (let index = 1; index < ranked.length; index += 1) {
      expect(ranked[index - 1].fitScore).toBeGreaterThanOrEqual(ranked[index].fitScore);
    }
  });

  it("uses registry order as deterministic tie-breaker for equal fit scores", () => {
    const registry = listFrameworkDefinitions();
    const first = registry[0];
    const second = registry[1];
    const tiedThemeWeights = first.themeWeights;

    const tiedFrameworks: FrameworkDefinition[] = [
      {
        ...first,
        themeWeights: tiedThemeWeights,
      },
      {
        ...second,
        themeWeights: tiedThemeWeights,
      },
    ];

    const ranked = rankFrameworkFitsForBrief(brief, tiedFrameworks);

    expect(ranked.map((framework) => framework.id)).toEqual([first.id, second.id]);
  });
});
