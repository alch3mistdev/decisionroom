import type {
  BcgVizData,
  ChasmVizData,
  ConflictResolutionVizData,
  ConsequencesVizData,
  CrossroadsVizData,
  DecisionBrief,
  DoubleLoopVizData,
  EisenhowerVizData,
  FrameworkId,
  HypeCycleVizData,
  MonteCarloVizData,
  ParetoVizData,
  ProjectPortfolioVizData,
  SwotVizData,
  ThemeVector,
  Top12DeepFrameworkId,
  VisualizationSpec,
} from "@/lib/types";
import { clamp, round } from "@/lib/utils/math";
import {
  aggressivenessHint,
  bounded,
  constraintPenalty,
  deadlinePressure,
  keywordScore,
  normalizeContributions,
  rankWeight,
  resourcePressure,
  tokenOverlap,
} from "@/lib/frameworks/scoring";
import { isTop12FrameworkId } from "@/lib/frameworks/visual-contracts";

const HYPE_PHASES = [
  { phase: "Innovation Trigger", x: 0.1, y: 0.32 },
  { phase: "Peak of Inflated Expectations", x: 0.3, y: 0.95 },
  { phase: "Trough of Disillusionment", x: 0.55, y: 0.2 },
  { phase: "Slope of Enlightenment", x: 0.76, y: 0.58 },
  { phase: "Plateau of Productivity", x: 0.92, y: 0.72 },
] as const;

const MANDATORY_MARKERS = [
  "soc2",
  "audit",
  "compliance",
  "regulatory",
  "legal",
  "security",
  "mandatory",
  "critical",
] as const;

const INTERNAL_MARKERS = [
  "team",
  "capacity",
  "headcount",
  "process",
  "workflow",
  "training",
  "resource",
  "budget",
  "implementation",
] as const;

const EXTERNAL_OPPORTUNITY_MARKERS = [
  "market",
  "customer",
  "enterprise",
  "partner",
  "segment",
  "adoption",
  "growth",
  "demand",
] as const;

const EXTERNAL_THREAT_MARKERS = [
  "competitor",
  "regulatory",
  "compliance",
  "security",
  "incident",
  "outage",
  "churn",
  "trust",
  "reputation",
  "csat",
] as const;

const CHASM_SEGMENT_SHARES: ChasmVizData["segments"] = [
  { segment: "Innovators", adoption: 0.025 },
  { segment: "Early Adopters", adoption: 0.135 },
  { segment: "Early Majority", adoption: 0.34 },
  { segment: "Late Majority", adoption: 0.34 },
  { segment: "Laggards", adoption: 0.16 },
];

function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const value of values) {
    const normalized = value.trim();
    if (normalized.length === 0) {
      continue;
    }
    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(normalized);
  }

  return unique;
}

function pickOptions(brief: DecisionBrief, maxItems: number): string[] {
  const candidates = dedupe([
    ...brief.alternatives,
    ...brief.executionSteps,
    ...brief.constraints,
    ...brief.openQuestions,
  ]);

  if (candidates.length === 0) {
    return ["Path A", "Path B", "Path C"].slice(0, maxItems);
  }

  return candidates.slice(0, maxItems);
}

function includesAny(value: string, tokens: readonly string[]): boolean {
  const normalized = value.toLowerCase();
  return tokens.some((token) => normalized.includes(token));
}

function withPrefix(values: string[], prefix: string): string[] {
  return values.map((value) => `${prefix}: ${value}`);
}

function questionToRiskStatement(question: string): string {
  const normalized = question.trim().replace(/[?]+$/g, "");
  if (!normalized) {
    return "Unresolved validation gap could trigger rollout failure";
  }
  return `Unresolved ${normalized.toLowerCase()} could trigger rollout failure`;
}

function toTestableAssumption(assumption: string, outcome: string, timeLimit: string | null): string {
  const normalizedAssumption = assumption.trim().replace(/[.]+$/g, "");
  const normalizedOutcome = outcome.trim().replace(/[.]+$/g, "");
  const windowText = timeLimit ? `within ${timeLimit}` : "within the next iteration";
  return `If ${normalizedAssumption.toLowerCase()}, then ${normalizedOutcome.toLowerCase()} should improve ${windowText}.`;
}

function interpolateYOnCurve(x: number): number {
  const clamped = clamp(x);
  for (let index = 0; index < HYPE_PHASES.length - 1; index += 1) {
    const left = HYPE_PHASES[index];
    const right = HYPE_PHASES[index + 1];

    if (clamped >= left.x && clamped <= right.x) {
      const ratio = (clamped - left.x) / Math.max(right.x - left.x, 1e-9);
      return bounded(left.y + ratio * (right.y - left.y));
    }
  }

  return bounded(HYPE_PHASES[HYPE_PHASES.length - 1].y);
}

function resolveHypePhase(x: number): string {
  const clamped = clamp(x);
  for (let index = 0; index < HYPE_PHASES.length - 1; index += 1) {
    const right = HYPE_PHASES[index + 1];
    if (clamped <= right.x) {
      return HYPE_PHASES[index].phase;
    }
  }

  return HYPE_PHASES[HYPE_PHASES.length - 1].phase;
}

function buildEisenhowerViz(brief: DecisionBrief, themes: ThemeVector): VisualizationSpec {
  const tasks = pickOptions(brief, 8);
  const successCorpus = brief.successCriteria.join(" ");
  const constraintsCorpus = brief.constraints.join(" ");
  const openQuestionsCorpus = brief.openQuestions.join(" ");
  const deadlineSignal = deadlinePressure(brief);

  const points: EisenhowerVizData["points"] = tasks.map((task, index) => {
    const mandatorySignal = includesAny(task, MANDATORY_MARKERS) ? 1 : 0;
    const complianceCriticality = bounded(
      0.7 * mandatorySignal + 0.3 * tokenOverlap(task, constraintsCorpus),
    );
    const customerImpact = bounded(
      0.5 * tokenOverlap(task, successCorpus) +
        0.3 * keywordScore(task, ["customer", "csat", "reliability", "quality", "incident"]) +
        0.2 * themes.stakeholderImpact,
    );
    const urgency = bounded(
      0.22 +
        0.24 * deadlineSignal +
        0.18 * tokenOverlap(task, constraintsCorpus) +
        0.12 * tokenOverlap(task, openQuestionsCorpus) +
        0.14 * themes.urgency +
        0.1 * complianceCriticality +
        0.06 * customerImpact,
    );
    const importance = bounded(
      0.2 +
        0.22 * tokenOverlap(task, successCorpus) +
        0.12 * tokenOverlap(task, brief.decisionStatement) +
        0.16 * themes.opportunity +
        0.16 * themes.stakeholderImpact +
        0.14 * tokenOverlap(task, constraintsCorpus) +
        0.1 * customerImpact +
        0.1 * complianceCriticality,
    );

    const effectiveImportance = bounded(
      importance + (complianceCriticality >= 0.45 ? 0.18 : 0),
    );

    let quadrant: EisenhowerVizData["points"][number]["quadrant"];
    if (complianceCriticality >= 0.45) {
      quadrant = urgency >= 0.45 ? "do" : "schedule";
    } else if (urgency >= 0.5 && effectiveImportance >= 0.5) {
      quadrant = "do";
    } else if (urgency < 0.5 && effectiveImportance >= 0.5) {
      quadrant = "schedule";
    } else if (
      urgency >= 0.5 &&
      effectiveImportance < 0.5 &&
      complianceCriticality < 0.35 &&
      customerImpact < 0.45
    ) {
      quadrant = "delegate";
    } else {
      quadrant = "eliminate";
    }

    return {
      label: task || `Task ${index + 1}`,
      urgency,
      importance: effectiveImportance,
      quadrant,
    };
  });

  const quadrants: EisenhowerVizData["quadrants"] = [
    { id: "do", label: "Do First", count: 0, items: [] },
    { id: "schedule", label: "Schedule", count: 0, items: [] },
    { id: "delegate", label: "Delegate", count: 0, items: [] },
    { id: "eliminate", label: "Don't Do", count: 0, items: [] },
  ];

  for (const point of points) {
    const target = quadrants.find((quadrant) => quadrant.id === point.quadrant);
    if (!target) {
      continue;
    }
    target.count += 1;
    target.items.push(point.label);
  }

  return {
    type: "quadrant",
    title: "Eisenhower Prioritization",
    xLabel: "Urgency",
    yLabel: "Importance",
    vizSchemaVersion: 2,
    data: {
      kind: "eisenhower_matrix",
      quadrants,
      points,
    } satisfies EisenhowerVizData,
  };
}

function buildSwotViz(brief: DecisionBrief): VisualizationSpec {
  const strengths = dedupe([
    ...withPrefix(brief.successCriteria, "Internal strength"),
    ...withPrefix(
      brief.alternatives.filter((alternative) => includesAny(alternative, INTERNAL_MARKERS)),
      "Internal capability",
    ),
  ]).slice(0, 5);
  const weaknesses = dedupe([
    ...withPrefix(brief.constraints, "Internal weakness"),
    ...withPrefix(brief.assumptions, "Internal fragility"),
  ]).slice(0, 5);
  const opportunities = dedupe([
    ...withPrefix(
      brief.executionSteps.filter((step) => includesAny(step, EXTERNAL_OPPORTUNITY_MARKERS)),
      "External opportunity",
    ),
    ...withPrefix(
      brief.openQuestions
        .filter((question) => includesAny(question, EXTERNAL_OPPORTUNITY_MARKERS))
        .map((question) => `Validate external demand signal: ${question}`),
      "External opportunity",
    ),
    ...withPrefix(
      brief.alternatives.filter((alternative) => includesAny(alternative, EXTERNAL_OPPORTUNITY_MARKERS)),
      "External growth path",
    ),
  ]).slice(0, 5);
  const threats = dedupe([
    ...withPrefix(
      brief.constraints.filter((constraint) => includesAny(constraint, EXTERNAL_THREAT_MARKERS)),
      "External threat",
    ),
    ...withPrefix(
      brief.openQuestions.map((question) => questionToRiskStatement(question)),
      "External threat",
    ),
  ]).slice(0, 5);

  const safeOpportunities =
    opportunities.length > 0
      ? opportunities
      : ["External opportunity: Controlled pilot can unlock broader enterprise demand."];
  const safeThreats =
    threats.length > 0
      ? threats
      : ["External threat: Market and trust response could degrade if rollout quality is weak."];

  return {
    type: "swot",
    title: "SWOT Analysis",
    vizSchemaVersion: 2,
    data: {
      kind: "swot_analysis",
      strengths: strengths.length > 0 ? strengths : ["No explicit strengths captured yet."],
      weaknesses: weaknesses.length > 0 ? weaknesses : ["No explicit weaknesses captured yet."],
      opportunities: safeOpportunities,
      threats: safeThreats,
    } satisfies SwotVizData,
  };
}

function buildBcgViz(brief: DecisionBrief, themes: ThemeVector): VisualizationSpec {
  const options = pickOptions(brief, 4);
  const successCorpus = brief.successCriteria.join(" ");
  const constraintCorpus = brief.constraints.join(" ");
  const penalty = constraintPenalty(brief);

  const points: BcgVizData["points"] = options.map((option, index) => {
    const opportunityFit = tokenOverlap(option, successCorpus);
    const riskDrag = tokenOverlap(option, constraintCorpus);
    const share = bounded(
      0.22 +
        0.35 * opportunityFit +
        0.18 * (1 - penalty) +
        0.15 * (1 - riskDrag) +
        0.1 * rankWeight(index, options.length),
    );
    const growth = bounded(
      0.2 +
        0.4 * themes.opportunity +
        0.2 * opportunityFit +
        0.1 * keywordScore(option, ["expand", "launch", "new", "growth", "scale"]) +
        0.1 * (1 - themes.uncertainty),
    );
    const quadrant =
      share < 0.5 && growth >= 0.5
        ? "question_marks"
        : share >= 0.5 && growth >= 0.5
          ? "stars"
          : share < 0.5 && growth < 0.5
            ? "dogs"
            : "cash_cows";

    return {
      id: `bcg-${index + 1}`,
      label: option,
      share,
      growth,
      size: round(28 + (share * 0.45 + growth * 0.55) * 64, 1),
      quadrant,
    };
  });

  return {
    type: "scatter",
    title: "BCG Growth-Share Matrix",
    xLabel: "Relative Market Share (high → low)",
    yLabel: "Market Growth",
    vizSchemaVersion: 2,
    data: {
      kind: "bcg_matrix",
      quadrants: {
        topLeft: "Stars",
        topRight: "Question Marks",
        bottomLeft: "Cash Cows",
        bottomRight: "Dogs",
      },
      points,
    } satisfies BcgVizData,
  };
}

function buildProjectPortfolioViz(brief: DecisionBrief, themes: ThemeVector): VisualizationSpec {
  const projects = pickOptions(brief, 6);
  const successCorpus = `${brief.decisionStatement} ${brief.successCriteria.join(" ")}`;
  const riskCorpus = `${brief.constraints.join(" ")} ${brief.openQuestions.join(" ")}`;

  const points: ProjectPortfolioVizData["points"] = projects.map((project, index) => {
    const value = bounded(
      0.2 +
        0.35 * tokenOverlap(project, successCorpus) +
        0.2 * themes.opportunity +
        0.15 * themes.stakeholderImpact +
        0.1 * rankWeight(index, projects.length),
    );
    const risk = bounded(
      0.18 +
        0.35 * tokenOverlap(project, riskCorpus) +
        0.25 * themes.risk +
        0.22 * themes.uncertainty,
    );
    const probability = bounded(
      0.2 +
        0.38 * (1 - risk) +
        0.22 * themes.resources +
        0.12 * tokenOverlap(project, brief.executionSteps.join(" ")) +
        0.08 * (1 - themes.uncertainty),
    );

    const quadrant =
      value >= 0.5 && risk >= 0.5
        ? "High Value, High Risk"
        : value < 0.5 && risk >= 0.5
          ? "Low Value, High Risk"
          : value >= 0.5 && risk < 0.5
            ? "High Value, Low Risk"
            : "Low Value, Low Risk";

    return {
      id: `portfolio-${index + 1}`,
      label: project,
      risk,
      value,
      probability,
      size: round(22 + (value * 0.55 + probability * 0.45) * 72, 1),
      quadrant,
    };
  });

  return {
    type: "scatter",
    title: "Project Portfolio Matrix",
    xLabel: "Risk",
    yLabel: "Strategic Value",
    vizSchemaVersion: 2,
    data: {
      kind: "project_portfolio_matrix",
      quadrants: {
        topLeft: "High Value, Low Risk",
        topRight: "High Value, High Risk",
        bottomLeft: "Low Value, Low Risk",
        bottomRight: "Low Value, High Risk",
      },
      points,
    } satisfies ProjectPortfolioVizData,
  };
}

function buildParetoViz(brief: DecisionBrief, themes: ThemeVector): VisualizationSpec {
  const factors = pickOptions(brief, 8);
  const successCorpus = `${brief.decisionStatement} ${brief.successCriteria.join(" ")}`;
  const constraintCorpus = brief.constraints.join(" ");

  const normalized = normalizeContributions(
    factors.map((factor, index) => ({
      label: factor,
      detail: brief.executionSteps[index] ?? factor,
      // Apply a rank decay to preserve Pareto concentration in the canonical view.
      // This prevents flat contribution curves that invalidate 80/20 interpretation.
      value:
        Math.pow(0.68, index) *
        (0.08 +
          0.48 * tokenOverlap(factor, successCorpus) +
          0.2 * tokenOverlap(factor, constraintCorpus) +
          0.14 * themes.opportunity +
          0.1 * Math.pow(rankWeight(index, factors.length), 2)),
    })),
  );

  return {
    type: "bar",
    title: "Pareto Impact Curve",
    xLabel: "Factors",
    yLabel: "Contribution",
    vizSchemaVersion: 2,
    data: {
      kind: "pareto_principle",
      factors: normalized.slice(0, 8),
      threshold: 0.8,
    } satisfies ParetoVizData,
  };
}

function buildHypeCycleViz(brief: DecisionBrief, themes: ThemeVector): VisualizationSpec {
  const currentX = bounded(
    0.16 +
      0.36 * themes.opportunity +
      0.18 * themes.uncertainty +
      0.12 * deadlinePressure(brief) -
      0.1 * themes.resources +
      0.06 * themes.risk,
  );

  return {
    type: "line",
    title: "Hype Cycle Positioning",
    xLabel: "Maturity",
    yLabel: "Expectations",
    vizSchemaVersion: 2,
    data: {
      kind: "hype_cycle",
      phases: HYPE_PHASES.map((phase) => ({ ...phase })),
      current: {
        label: brief.alternatives[0] ?? brief.title,
        x: currentX,
        y: interpolateYOnCurve(currentX),
        phase: resolveHypePhase(currentX),
      },
    } satisfies HypeCycleVizData,
  };
}

function buildChasmViz(brief: DecisionBrief, themes: ThemeVector): VisualizationSpec {
  const segments: ChasmVizData["segments"] = CHASM_SEGMENT_SHARES.map((segment) => ({ ...segment }));
  const chasmRisk = bounded(
    0.12 +
      0.3 * themes.uncertainty +
      0.22 * themes.risk +
      0.12 * (1 - themes.resources) +
      0.1 * (1 - themes.opportunity) +
      0.14 * deadlinePressure(brief),
  );

  return {
    type: "bar",
    title: "Diffusion / Chasm Adoption",
    xLabel: "Adopter Segment",
    yLabel: "Segment Share",
    vizSchemaVersion: 2,
    data: {
      kind: "chasm_diffusion_model",
      segments,
      chasmAfter: "Early Adopters",
      gap: chasmRisk,
    } satisfies ChasmVizData,
  };
}

function buildMonteCarloViz(brief: DecisionBrief, themes: ThemeVector): VisualizationSpec {
  const total = 360;
  const bins = 10;
  const mean = bounded(
    0.22 +
      0.34 * themes.opportunity +
      0.2 * resourcePressure(brief, themes) +
      0.14 * (1 - themes.risk) +
      0.1 * (1 - themes.uncertainty),
  );
  const sigma = clamp(0.08 + 0.18 * themes.uncertainty + 0.1 * themes.risk, 0.06, 0.32);

  const densityValues = Array.from({ length: bins }, (_, index) => {
    const center = (index + 0.5) / bins;
    const exponent = -((center - mean) ** 2) / (2 * sigma * sigma);
    return Math.exp(exponent);
  });

  const sumDensity = densityValues.reduce((sum, value) => sum + value, 0);
  const rawCounts = densityValues.map((value) => (value / Math.max(sumDensity, 1e-9)) * total);
  const floorCounts = rawCounts.map((value) => Math.floor(value));
  let remaining = total - floorCounts.reduce((sum, value) => sum + value, 0);

  const order = rawCounts
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction);
  for (const item of order) {
    if (remaining <= 0) {
      break;
    }
    floorCounts[item.index] += 1;
    remaining -= 1;
  }

  const histogram: MonteCarloVizData["bins"] = floorCounts.map((count, index) => ({
    binStart: round(index / bins, 2),
    binEnd: round((index + 1) / bins, 2),
    count,
  }));

  return {
    type: "histogram",
    title: "Monte Carlo Outcome Distribution",
    xLabel: "Outcome Probability",
    yLabel: "Frequency",
    vizSchemaVersion: 2,
    data: {
      kind: "monte_carlo_simulation",
      bins: histogram,
      total,
      p10: bounded(mean - 1.2816 * sigma),
      p50: mean,
      p90: bounded(mean + 1.2816 * sigma),
      metadata: {
        trials: total,
        distribution: "gaussian_approximation",
        correlationMode: "independent_factors",
      },
    } satisfies MonteCarloVizData,
  };
}

function buildConsequencesViz(brief: DecisionBrief, themes: ThemeVector): VisualizationSpec {
  const urgency = deadlinePressure(brief);
  const direct0 = bounded(0.32 + 0.24 * urgency + 0.22 * themes.risk + 0.14 * themes.urgency);
  const direct1 = bounded(direct0 * 0.88 + 0.08 * themes.opportunity);
  const direct2 = bounded(direct1 * 0.84 + 0.1 * themes.opportunity - 0.06 * themes.urgency);
  const direct3 = bounded(direct2 * 0.81 + 0.12 * themes.opportunity - 0.05 * themes.risk);

  const indirect0 = bounded(0.18 + 0.16 * themes.stakeholderImpact + 0.1 * themes.uncertainty);
  const indirect1 = bounded(indirect0 * 1.18 + 0.08 * themes.stakeholderImpact + 0.06 * themes.risk);
  const indirect2 = bounded(indirect1 * 1.14 + 0.1 * themes.stakeholderImpact + 0.06 * themes.uncertainty);
  const indirect3 = bounded(indirect2 * 1.1 + 0.08 * themes.stakeholderImpact);

  const third0 = bounded(0.1 + 0.16 * themes.uncertainty + 0.1 * themes.stakeholderImpact);
  const third1 = bounded(third0 * 1.25 + 0.08 * themes.risk + 0.06 * themes.uncertainty);
  const third2 = bounded(third1 * 1.2 + 0.08 * themes.stakeholderImpact + 0.06 * themes.risk);
  const third3 = bounded(third2 * 1.12 + 0.08 * themes.stakeholderImpact);

  const horizons: ConsequencesVizData["horizons"] = [
    {
      horizon: "Immediate",
      direct: direct0,
      indirect: indirect0,
      thirdOrder: third0,
      net: round(direct0 - indirect0 - third0 * 0.5, 3),
    },
    {
      horizon: "30 Days",
      direct: direct1,
      indirect: indirect1,
      thirdOrder: third1,
      net: round(direct1 - indirect1 - third1 * 0.5, 3),
    },
    {
      horizon: "90 Days",
      direct: direct2,
      indirect: indirect2,
      thirdOrder: third2,
      net: round(direct2 - indirect2 - third2 * 0.5, 3),
    },
    {
      horizon: "1 Year",
      direct: direct3,
      indirect: indirect3,
      thirdOrder: third3,
      net: round(direct3 - indirect3 - third3 * 0.5, 3),
    },
  ];

  const links: ConsequencesVizData["links"] = [
    { from: "Immediate", to: "30 Days", weight: round((indirect0 + third0 + indirect1 + third1) / 4, 3) },
    { from: "30 Days", to: "90 Days", weight: round((indirect1 + third1 + indirect2 + third2) / 4, 3) },
    { from: "90 Days", to: "1 Year", weight: round((indirect2 + third2 + indirect3 + third3) / 4, 3) },
  ];

  return {
    type: "timeline",
    title: "Consequences Over Time",
    xLabel: "Horizon",
    yLabel: "Impact Magnitude",
    vizSchemaVersion: 2,
    data: {
      kind: "consequences_model",
      horizons,
      links,
    } satisfies ConsequencesVizData,
  };
}

function buildCrossroadsViz(brief: DecisionBrief, themes: ThemeVector): VisualizationSpec {
  const options = pickOptions(brief, 4);
  const successCorpus = `${brief.decisionStatement} ${brief.successCriteria.join(" ")}`;
  const constraintsCorpus = brief.constraints.join(" ");

  const rows: CrossroadsVizData["options"] = options.map((option) => {
    const aggressive = aggressivenessHint(option);
    const feasibility = bounded(
      0.26 +
        0.32 * themes.resources +
        0.18 * (1 - tokenOverlap(option, constraintsCorpus)) +
        0.14 * (1 - themes.risk) +
        0.1 * (1 - aggressive),
    );
    const desirability = bounded(
      0.24 +
        0.34 * tokenOverlap(option, successCorpus) +
        0.22 * themes.opportunity +
        0.12 * themes.stakeholderImpact +
        0.08 * aggressive,
    );
    const reversibility = bounded(
      0.22 +
        0.34 * (1 - aggressive) +
        0.16 * keywordScore(option, ["pilot", "phase", "trial", "option"]) +
        0.14 * (1 - themes.risk) +
        0.14 * (1 - themes.uncertainty),
    );

    return {
      option,
      feasibility,
      desirability,
      reversibility,
      size: round(28 + reversibility * 68, 1),
      note:
        feasibility >= 0.6 && desirability >= 0.6
          ? "Advance with clear gates"
          : feasibility < 0.45
            ? "Needs feasibility proof first"
            : "Viable with controlled experiment",
    };
  });

  return {
    type: "scatter",
    title: "Crossroads Option Map",
    xLabel: "Feasibility",
    yLabel: "Desirability",
    vizSchemaVersion: 2,
    data: {
      kind: "crossroads_model",
      options: rows,
    } satisfies CrossroadsVizData,
  };
}

function buildConflictResolutionViz(brief: DecisionBrief, themes: ThemeVector): VisualizationSpec {
  const urgency = deadlinePressure(brief);
  const collaborationBias = bounded(0.3 + 0.35 * themes.stakeholderImpact + 0.2 * (1 - urgency));
  const compromiseBias = bounded(0.25 + 0.3 * urgency + 0.2 * themes.resources);
  const assertivenessBias = bounded(0.25 + 0.28 * themes.urgency + 0.2 * (1 - themes.uncertainty));

  const modes: ConflictResolutionVizData["modes"] = [
    {
      mode: "Competing",
      assertiveness: 0.88,
      cooperativeness: 0.2,
      suitability: bounded(0.35 * assertivenessBias + 0.28 * urgency + 0.12 * (1 - collaborationBias)),
    },
    {
      mode: "Collaborating",
      assertiveness: 0.82,
      cooperativeness: 0.9,
      suitability: bounded(0.4 * collaborationBias + 0.2 * themes.stakeholderImpact + 0.15 * (1 - themes.risk)),
    },
    {
      mode: "Compromising",
      assertiveness: 0.6,
      cooperativeness: 0.62,
      suitability: bounded(0.38 * compromiseBias + 0.2 * themes.resources + 0.14 * urgency),
    },
    {
      mode: "Avoiding",
      assertiveness: 0.18,
      cooperativeness: 0.2,
      suitability: bounded(0.32 * themes.uncertainty + 0.16 * (1 - urgency) + 0.14 * themes.risk),
    },
    {
      mode: "Accommodating",
      assertiveness: 0.22,
      cooperativeness: 0.85,
      suitability: bounded(0.3 * themes.stakeholderImpact + 0.2 * (1 - assertivenessBias)),
    },
  ];

  const recommendedMode = modes
    .slice()
    .sort((a, b) => b.suitability - a.suitability)[0]?.mode ?? "Collaborating";

  return {
    type: "scatter",
    title: "Conflict Mode Map (TKI)",
    xLabel: "Assertiveness",
    yLabel: "Cooperativeness",
    vizSchemaVersion: 2,
    data: {
      kind: "conflict_resolution_model",
      modes,
      recommendedMode,
    } satisfies ConflictResolutionVizData,
  };
}

function buildDoubleLoopViz(brief: DecisionBrief, themes: ThemeVector): VisualizationSpec {
  const behaviors = pickOptions(brief, 5);
  const assumptions = brief.assumptions.length > 0 ? brief.assumptions : ["Execution assumptions are stable."];
  const outcomes = brief.successCriteria.length > 0 ? brief.successCriteria : ["Maintain measurable progress."];
  const openQuestionsCorpus = brief.openQuestions.join(" ");
  const constraintCorpus = brief.constraints.join(" ");

  const loops: DoubleLoopVizData["loops"] = behaviors.map((behavior, index) => {
    const leverage = bounded(
      0.24 +
        0.32 * tokenOverlap(behavior, `${openQuestionsCorpus} ${constraintCorpus}`) +
        0.2 * themes.risk +
        0.16 * themes.uncertainty +
        0.08 * rankWeight(index, behaviors.length),
    );

    return {
      behavior,
      outcome: outcomes[index % outcomes.length],
      singleLoopFix: `Tune process around ${behavior} using a 1-cycle measurable adjustment.`,
      rootAssumption: toTestableAssumption(
        assumptions[index % assumptions.length],
        outcomes[index % outcomes.length],
        brief.timeLimit,
      ),
      leverage,
    };
  });

  return {
    type: "list",
    title: "Double-Loop Learning Trace",
    vizSchemaVersion: 2,
    data: {
      kind: "double_loop_learning",
      loops,
    } satisfies DoubleLoopVizData,
  };
}

export function buildCanonicalTop12Visualization(
  frameworkId: Top12DeepFrameworkId,
  brief: DecisionBrief,
  themes: ThemeVector,
): VisualizationSpec {
  switch (frameworkId) {
    case "eisenhower_matrix":
      return buildEisenhowerViz(brief, themes);
    case "swot_analysis":
      return buildSwotViz(brief);
    case "bcg_matrix":
      return buildBcgViz(brief, themes);
    case "project_portfolio_matrix":
      return buildProjectPortfolioViz(brief, themes);
    case "pareto_principle":
      return buildParetoViz(brief, themes);
    case "hype_cycle":
      return buildHypeCycleViz(brief, themes);
    case "chasm_diffusion_model":
      return buildChasmViz(brief, themes);
    case "monte_carlo_simulation":
      return buildMonteCarloViz(brief, themes);
    case "consequences_model":
      return buildConsequencesViz(brief, themes);
    case "crossroads_model":
      return buildCrossroadsViz(brief, themes);
    case "conflict_resolution_model":
      return buildConflictResolutionViz(brief, themes);
    case "double_loop_learning":
      return buildDoubleLoopViz(brief, themes);
    default:
      return {
        type: "radar",
        title: "Theme Fit",
        vizSchemaVersion: 2,
        data: [],
      };
  }
}

export function buildCanonicalVisualizationIfTop12(
  frameworkId: FrameworkId,
  brief: DecisionBrief,
  themes: ThemeVector,
): VisualizationSpec | null {
  if (!isTop12FrameworkId(frameworkId)) {
    return null;
  }

  return buildCanonicalTop12Visualization(frameworkId, brief, themes);
}
