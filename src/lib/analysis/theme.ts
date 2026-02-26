import type { DecisionBrief, ThemeVector } from "@/lib/types";
import { clamp, round } from "@/lib/utils/math";

export const ZERO_THEME: ThemeVector = {
  risk: 0,
  urgency: 0,
  opportunity: 0,
  uncertainty: 0,
  resources: 0,
  stakeholderImpact: 0,
};

export function normalizeThemeVector(vector: ThemeVector): ThemeVector {
  return {
    risk: round(clamp(vector.risk)),
    urgency: round(clamp(vector.urgency)),
    opportunity: round(clamp(vector.opportunity)),
    uncertainty: round(clamp(vector.uncertainty)),
    resources: round(clamp(vector.resources)),
    stakeholderImpact: round(clamp(vector.stakeholderImpact)),
  };
}

export function blendThemeVectors(base: ThemeVector, modifier: ThemeVector, weight = 0.5): ThemeVector {
  return normalizeThemeVector({
    risk: base.risk * (1 - weight) + modifier.risk * weight,
    urgency: base.urgency * (1 - weight) + modifier.urgency * weight,
    opportunity: base.opportunity * (1 - weight) + modifier.opportunity * weight,
    uncertainty: base.uncertainty * (1 - weight) + modifier.uncertainty * weight,
    resources: base.resources * (1 - weight) + modifier.resources * weight,
    stakeholderImpact:
      base.stakeholderImpact * (1 - weight) + modifier.stakeholderImpact * weight,
  });
}

export function inferDecisionThemeVector(brief: DecisionBrief): ThemeVector {
  const promptText = [brief.decisionStatement, brief.context].join(" ").toLowerCase();

  const urgencyKeywords = ["urgent", "deadline", "asap", "immediately", "launch"];
  const riskKeywords = ["risk", "failure", "compliance", "legal", "security", "loss"];
  const opportunityKeywords = ["growth", "expand", "market", "innovation", "upside"];
  const uncertaintyKeywords = ["unknown", "uncertain", "estimate", "assume", "hypothesis"];
  const resourceKeywords = ["budget", "cost", "capacity", "headcount", "resource"];
  const stakeholderKeywords = ["stakeholder", "team", "customer", "partner", "board"];

  const containsAny = (keywords: string[]): number =>
    keywords.some((keyword) => promptText.includes(keyword)) ? 0.15 : 0;

  const deadlineBoost = brief.deadline ? 0.2 : 0;
  const riskToleranceBoost =
    brief.riskTolerance === "low" ? 0.2 : brief.riskTolerance === "high" ? -0.08 : 0.08;

  const base: ThemeVector = {
    risk: 0.35 + containsAny(riskKeywords) + riskToleranceBoost + brief.assumptions.length * 0.01,
    urgency:
      0.32 +
      deadlineBoost +
      containsAny(urgencyKeywords) +
      Math.min(brief.executionSteps.length, 10) * 0.02,
    opportunity:
      0.42 +
      containsAny(opportunityKeywords) +
      Math.min(brief.successCriteria.length, 10) * 0.02,
    uncertainty:
      0.35 +
      containsAny(uncertaintyKeywords) +
      Math.min(brief.openQuestions.length, 10) * 0.03,
    resources:
      0.35 +
      (brief.budget ? 0.15 : 0.05) +
      (brief.timeLimit ? 0.1 : 0.04) +
      containsAny(resourceKeywords),
    stakeholderImpact:
      0.35 +
      Math.min(brief.stakeholders.length, 10) * 0.04 +
      containsAny(stakeholderKeywords),
  };

  return normalizeThemeVector(base);
}
