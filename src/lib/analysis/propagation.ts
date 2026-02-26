import { hashStringToFloat } from "@/lib/utils/hash";
import { clamp, cosineSimilarity, round } from "@/lib/utils/math";
import type {
  DecisionBrief,
  DecisionOptionScore,
  DecisionRecommendation,
  FrameworkId,
  FrameworkResult,
  PropagatedDecisionMap,
  PropagatedMapEdge,
  SynthesisSummary,
  ThemeVector,
} from "@/lib/types";

const THEME_KEYS: Array<keyof ThemeVector> = [
  "risk",
  "urgency",
  "opportunity",
  "uncertainty",
  "resources",
  "stakeholderImpact",
];

function dominantTheme(themes: ThemeVector): keyof ThemeVector {
  return THEME_KEYS.reduce((best, key) => (themes[key] > themes[best] ? key : best), "risk");
}

function rationaleForEdge(
  source: FrameworkResult,
  target: FrameworkResult,
  relationType: PropagatedMapEdge["relationType"],
): string {
  const sourceTheme = dominantTheme(source.themes);
  const targetTheme = dominantTheme(target.themes);

  if (relationType === "consensus") {
    return `${source.frameworkName} and ${target.frameworkName} converge on ${sourceTheme}/${targetTheme} as primary drivers.`;
  }

  if (relationType === "conflict") {
    return `${source.frameworkName} emphasizes ${sourceTheme}, while ${target.frameworkName} leans toward ${targetTheme}, creating a tradeoff.`;
  }

  return `${source.frameworkName} and ${target.frameworkName} are directionally related with partial overlap.`;
}

function averageThemes(frameworkResults: FrameworkResult[]): ThemeVector {
  if (frameworkResults.length === 0) {
    return {
      risk: 0.5,
      urgency: 0.5,
      opportunity: 0.5,
      uncertainty: 0.5,
      resources: 0.5,
      stakeholderImpact: 0.5,
    };
  }

  const totals = frameworkResults.reduce(
    (acc, result) => ({
      risk: acc.risk + result.themes.risk,
      urgency: acc.urgency + result.themes.urgency,
      opportunity: acc.opportunity + result.themes.opportunity,
      uncertainty: acc.uncertainty + result.themes.uncertainty,
      resources: acc.resources + result.themes.resources,
      stakeholderImpact: acc.stakeholderImpact + result.themes.stakeholderImpact,
    }),
    {
      risk: 0,
      urgency: 0,
      opportunity: 0,
      uncertainty: 0,
      resources: 0,
      stakeholderImpact: 0,
    },
  );

  return {
    risk: totals.risk / frameworkResults.length,
    urgency: totals.urgency / frameworkResults.length,
    opportunity: totals.opportunity / frameworkResults.length,
    uncertainty: totals.uncertainty / frameworkResults.length,
    resources: totals.resources / frameworkResults.length,
    stakeholderImpact: totals.stakeholderImpact / frameworkResults.length,
  };
}

function deriveOptions(brief: DecisionBrief): string[] {
  const options = brief.alternatives
    .map((option) => option.trim())
    .filter(Boolean);

  if (options.length >= 2) {
    return options.slice(0, 8);
  }

  return ["Conservative rollout", "Phased pilot", "Full-scale commitment"];
}

function aggressivenessScore(option: string): number {
  const normalized = option.toLowerCase();

  if (
    normalized.includes("full") ||
    normalized.includes("aggressive") ||
    normalized.includes("all-in") ||
    normalized.includes("commitment")
  ) {
    return 0.88;
  }

  if (
    normalized.includes("pilot") ||
    normalized.includes("phase") ||
    normalized.includes("incremental") ||
    normalized.includes("trial")
  ) {
    return 0.45;
  }

  if (normalized.includes("conservative") || normalized.includes("safe")) {
    return 0.28;
  }

  return 0.62;
}

function scoreDecisionOptions(
  brief: DecisionBrief,
  frameworkResults: FrameworkResult[],
  recommendedActions: string[],
): DecisionRecommendation {
  const options = deriveOptions(brief);
  const themes = averageThemes(frameworkResults);
  const averageConfidence =
    frameworkResults.length === 0
      ? 0.58
      : frameworkResults.reduce((sum, result) => sum + result.confidence, 0) / frameworkResults.length;

  const optionScores: DecisionOptionScore[] = options.map((option, index) => {
    const aggressiveness = aggressivenessScore(option);
    const seed = hashStringToFloat(`${brief.title}:${option}`, `option-${index}`);
    const optionality = clamp(1 - aggressiveness * 0.7 + seed * 0.3);

    const riskFit =
      brief.riskTolerance === "low"
        ? 1 - aggressiveness * 0.9
        : brief.riskTolerance === "medium"
          ? 1 - Math.abs(aggressiveness - 0.6)
          : clamp(aggressiveness * 1.05);

    const opportunityFit = clamp(themes.opportunity * (0.45 + aggressiveness * 0.65));
    const resourceFit = clamp((1 - aggressiveness * 0.5) * (0.45 + themes.resources * 0.55));
    const uncertaintyPenalty = themes.uncertainty * (0.3 + aggressiveness * 0.55);
    const stakeholderFit = clamp(themes.stakeholderImpact * (0.65 + optionality * 0.35));

    const score = clamp(
      0.3 * riskFit +
        0.22 * opportunityFit +
        0.18 * resourceFit +
        0.2 * stakeholderFit +
        0.1 * optionality -
        0.2 * uncertaintyPenalty,
    );

    const confidence = clamp(averageConfidence * 0.7 + (1 - Math.abs(score - 0.62)) * 0.2 + seed * 0.1);

    return {
      option,
      score: round(score, 3),
      confidence: round(confidence, 3),
      rationale:
        brief.riskTolerance === "low"
          ? `${option} controls downside while maintaining execution momentum.`
          : brief.riskTolerance === "high"
            ? `${option} maximizes upside potential with higher volatility tolerance.`
            : `${option} balances upside with manageable execution risk.`,
    };
  });

  optionScores.sort((a, b) => b.score - a.score);
  const best = optionScores[0];
  const second = optionScores[1] ?? optionScores[0];
  const scoreGap = clamp(best.score - second.score);

  const topFrameworkNames = frameworkResults
    .slice()
    .sort((a, b) => b.applicabilityScore * b.confidence - a.applicabilityScore * a.confidence)
    .slice(0, 3)
    .map((result) => result.frameworkName);

  return {
    recommendedOption: best.option,
    confidence: round(clamp(best.confidence * 0.65 + scoreGap * 0.35), 3),
    rationale: `${best.option} is currently the strongest choice based on score fit (${Math.round(
      best.score * 100,
    )}%) and support from ${topFrameworkNames.join(", ")}.`,
    tradeoffs: [
      `${second.option} remains a viable backup at ${Math.round(second.score * 100)}% score fit.`,
      `Highest uncertainty impact is currently in ${dominantTheme(themes)}; monitor that metric early.`,
      `If risk tolerance changes, re-run analysis to rebalance option scoring.`,
    ],
    nextActions: recommendedActions.slice(0, 3),
    optionScores,
  };
}

export function buildPropagatedDecisionMap(frameworkResults: FrameworkResult[]): PropagatedDecisionMap {
  const nodes = frameworkResults.map((result) => ({
    id: result.frameworkId,
    label: result.frameworkName,
    category: result.deepSupported ? "deep" : "registry",
    deepSupported: result.deepSupported,
    applicabilityScore: result.applicabilityScore,
    confidence: result.confidence,
    themes: result.themes,
  }));

  const rawEdges: PropagatedMapEdge[] = [];

  for (let i = 0; i < frameworkResults.length; i += 1) {
    for (let j = i + 1; j < frameworkResults.length; j += 1) {
      const source = frameworkResults[i];
      const target = frameworkResults[j];
      const similarity = cosineSimilarity(source.themes, target.themes);

      let relationType: PropagatedMapEdge["relationType"] = "related";
      if (similarity >= 0.82) {
        relationType = "consensus";
      } else if (similarity <= 0.56) {
        relationType = "conflict";
      }

      if (relationType === "related" && similarity < 0.7) {
        continue;
      }

      rawEdges.push({
        source: source.frameworkId,
        target: target.frameworkId,
        relationType,
        weight: round(relationType === "conflict" ? 1 - similarity : similarity, 3),
        rationale: rationaleForEdge(source, target, relationType),
      });
    }
  }

  rawEdges.sort((a, b) => b.weight - a.weight);
  const edges = rawEdges.slice(0, 220);

  const clusters = Object.entries(
    nodes.reduce<Record<string, FrameworkId[]>>((acc, node) => {
      if (!acc[node.category]) {
        acc[node.category] = [];
      }

      acc[node.category].push(node.id);
      return acc;
    }, {}),
  ).map(([category, frameworkIds]) => ({
    category,
    frameworkIds,
  }));

  const conflicts = edges.filter((edge) => edge.relationType === "conflict");
  const consensus = edges.filter((edge) => edge.relationType === "consensus");

  return {
    nodes,
    edges,
    clusters,
    conflicts,
    consensus,
  };
}

export function buildSynthesisSummary(
  brief: DecisionBrief,
  frameworkResults: FrameworkResult[],
  propagatedMap: PropagatedDecisionMap,
): SynthesisSummary {
  const ranked = frameworkResults
    .map((result) => ({
      ...result,
      composite: result.applicabilityScore * 0.6 + result.confidence * 0.4,
    }))
    .sort((a, b) => b.composite - a.composite)
    .slice(0, 5);

  const contradictions = propagatedMap.conflicts.slice(0, 6).map((edge) => ({
    sourceFrameworkId: edge.source,
    targetFrameworkId: edge.target,
    reason: edge.rationale,
  }));

  const recommendedActions = [...new Set(ranked.flatMap((item) => item.actions).slice(0, 10))];

  const checkpoints = [
    "Re-score top frameworks after first execution milestone.",
    "Track conflict edges with highest weight in weekly review.",
    "Update assumptions and rerun analysis when constraints change.",
  ];
  const decisionRecommendation = scoreDecisionOptions(brief, frameworkResults, recommendedActions);

  return {
    topFrameworks: ranked.map((item) => ({
      frameworkId: item.frameworkId,
      frameworkName: item.frameworkName,
      compositeScore: round(item.composite, 3),
      reason: `High fit on ${dominantTheme(item.themes)} with strong confidence.`,
    })),
    contradictions,
    recommendedActions,
    checkpoints,
    decisionRecommendation,
  };
}
