import { inferDecisionThemeVector } from "@/lib/analysis/theme";
import type {
  DecisionBrief,
  FrameworkDefinition,
  RankedFrameworkFit,
  ThemeVector,
} from "@/lib/types";
import { clamp } from "@/lib/utils/math";

const THEME_KEYS: Array<keyof ThemeVector> = [
  "risk",
  "urgency",
  "opportunity",
  "uncertainty",
  "resources",
  "stakeholderImpact",
];

export function computeThemeFitScore(themeWeights: ThemeVector, decisionThemes: ThemeVector): number {
  let weighted = 0;
  let weights = 0;

  for (const key of THEME_KEYS) {
    const weight = themeWeights[key];
    weighted += weight * decisionThemes[key];
    weights += weight;
  }

  return clamp(weighted / Math.max(weights, 1e-6));
}

export function rankFrameworkFitsForBrief(
  brief: DecisionBrief,
  frameworks: FrameworkDefinition[],
): RankedFrameworkFit[] {
  const decisionThemes = inferDecisionThemeVector(brief);

  const ranked = frameworks
    .map((framework, orderIndex) => ({
      framework,
      orderIndex,
      fitScore: computeThemeFitScore(framework.themeWeights, decisionThemes),
    }))
    .sort((left, right) => {
      const scoreDiff = right.fitScore - left.fitScore;
      if (scoreDiff !== 0) {
        return scoreDiff;
      }

      return left.orderIndex - right.orderIndex;
    });

  return ranked.map((item, index) => ({
    rank: index + 1,
    id: item.framework.id,
    name: item.framework.name,
    deepSupported: item.framework.deepSupported,
    fitScore: item.fitScore,
  }));
}
