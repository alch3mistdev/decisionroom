import type {
  BcgVizData,
  ChasmVizData,
  ConflictResolutionVizData,
  ConsequencesVizData,
  CrossroadsVizData,
  DoubleLoopVizData,
  EisenhowerVizData,
  HypeCycleVizData,
  MonteCarloVizData,
  ParetoVizData,
  ProjectPortfolioVizData,
  SwotVizData,
  Top12DeepFrameworkId,
  Top12VisualizationData,
} from "@/lib/types";
import { clamp, round } from "@/lib/utils/math";

export const TOP12_RUBRIC_VERSION = 1;

export interface RubricCriterionResult {
  id: string;
  label: string;
  weight: number;
  score: number;
  passed: boolean;
  issue?: string;
  remediation: string;
}

export interface Top12RubricReport {
  frameworkId: Top12DeepFrameworkId;
  rubricVersion: number;
  score: number;
  passThreshold: number;
  passed: boolean;
  criteria: RubricCriterionResult[];
  remediationPlan: string[];
}

interface CriterionScore {
  score: number;
  issue?: string;
}

interface CriterionDefinition<TData> {
  id: string;
  label: string;
  weight: number;
  passFloor?: number;
  remediation: string;
  evaluate: (data: TData) => CriterionScore;
}

const PASS_THRESHOLD = 0.85;

const CANONICAL_HYPE_PHASES = [
  "Innovation Trigger",
  "Peak of Inflated Expectations",
  "Trough of Disillusionment",
  "Slope of Enlightenment",
  "Plateau of Productivity",
] as const;

const CANONICAL_CHASM_SEGMENTS = [
  "Innovators",
  "Early Adopters",
  "Early Majority",
  "Late Majority",
  "Laggards",
] as const;

const CANONICAL_CHASM_SHARES = [0.025, 0.135, 0.34, 0.34, 0.16] as const;

const INTERNAL_MARKERS = [
  "internal",
  "team",
  "support",
  "process",
  "capacity",
  "headcount",
  "resource",
  "budget",
  "workflow",
  "implementation",
  "system",
  "training",
  "quality",
  "soc2",
  "audit",
  "compliance",
  "control",
];

const EXTERNAL_MARKERS = [
  "external",
  "market",
  "customer",
  "enterprise",
  "partner",
  "competitor",
  "regulatory",
  "legal",
  "segment",
  "adoption",
  "reputation",
  "churn",
  "trust",
  "demand",
  "industry",
];

const THREAT_QUESTION_PREFIXES = ["what ", "how ", "which ", "who ", "when ", "where ", "is ", "are ", "can "];

function boundedScore(value: number): number {
  return round(clamp(value), 3);
}

function ratio(numerator: number, denominator: number): number {
  if (denominator <= 0) {
    return 1;
  }

  return numerator / denominator;
}

function lower(value: string): string {
  return value.toLowerCase().trim();
}

function includesAny(source: string, fragments: readonly string[]): boolean {
  const normalized = lower(source);
  return fragments.some((fragment) => normalized.includes(fragment));
}

function markerAlignmentScore(items: string[], targetMarkers: readonly string[]): number {
  if (items.length === 0) {
    return 0;
  }

  const matches = items.filter((item) => includesAny(item, targetMarkers)).length;
  return boundedScore(matches / items.length);
}

function approxEqual(left: number, right: number, tolerance: number): boolean {
  return Math.abs(left - right) <= tolerance;
}

function evaluateCriteria<TData>(
  frameworkId: Top12DeepFrameworkId,
  data: TData,
  criteria: Array<CriterionDefinition<TData>>,
): Top12RubricReport {
  const results: RubricCriterionResult[] = criteria.map((criterion) => {
    const raw = criterion.evaluate(data);
    const score = boundedScore(raw.score);

    return {
      id: criterion.id,
      label: criterion.label,
      weight: criterion.weight,
      score,
      passed: score >= (criterion.passFloor ?? PASS_THRESHOLD),
      issue: raw.issue,
      remediation: criterion.remediation,
    };
  });

  const weightTotal = results.reduce((sum, criterion) => sum + criterion.weight, 0);
  const weightedScore = results.reduce((sum, criterion) => sum + criterion.score * criterion.weight, 0);
  const score = boundedScore(weightedScore / Math.max(weightTotal, 1e-9));
  const remediationPlan = results.filter((criterion) => !criterion.passed).map((criterion) => criterion.remediation);

  return {
    frameworkId,
    rubricVersion: TOP12_RUBRIC_VERSION,
    score,
    passThreshold: PASS_THRESHOLD,
    passed: score >= PASS_THRESHOLD,
    criteria: results,
    remediationPlan,
  };
}

function eisenhowerCriteria(): Array<CriterionDefinition<EisenhowerVizData>> {
  const mustDoMarkers = ["soc2", "audit", "compliance", "mandatory", "critical", "security", "regulatory", "legal"];

  return [
    {
      id: "quadrant-rule",
      label: "Quadrant assignment matches urgency/importance thresholds",
      weight: 0.4,
      remediation: "Recompute each point quadrant strictly from urgency/importance and regenerate counts.",
      evaluate: (data) => {
        if (data.points.length === 0) {
          return { score: 0, issue: "No points are present in the matrix." };
        }

        const matches = data.points.filter((point) => {
          const expected =
            point.urgency >= 0.5 && point.importance >= 0.5
              ? "do"
              : point.urgency < 0.5 && point.importance >= 0.5
                ? "schedule"
                : point.urgency >= 0.5 && point.importance < 0.5
                  ? "delegate"
                  : "eliminate";

          return point.quadrant === expected;
        }).length;

        const score = ratio(matches, data.points.length);
        return score < 1
          ? { score, issue: `${data.points.length - matches} points violate matrix threshold rules.` }
          : { score };
      },
    },
    {
      id: "quadrant-counts",
      label: "Quadrant rollups are consistent with points",
      weight: 0.3,
      remediation: "Regenerate quadrant counts/items from point assignments instead of free-form values.",
      evaluate: (data) => {
        const bucket = new Map<EisenhowerVizData["points"][number]["quadrant"], number>([
          ["do", 0],
          ["schedule", 0],
          ["delegate", 0],
          ["eliminate", 0],
        ]);

        for (const point of data.points) {
          bucket.set(point.quadrant, (bucket.get(point.quadrant) ?? 0) + 1);
        }

        const mismatches = data.quadrants.filter((quadrant) => {
          const expected = bucket.get(quadrant.id) ?? 0;
          return expected !== quadrant.count || quadrant.count !== quadrant.items.length;
        }).length;

        const score = ratio(data.quadrants.length - mismatches, data.quadrants.length);
        return mismatches > 0
          ? { score, issue: `${mismatches} quadrant summaries are out of sync with plotted points.` }
          : { score };
      },
    },
    {
      id: "mandatory-not-delegated",
      label: "Mandatory/compliance items are not delegated or eliminated",
      weight: 0.3,
      remediation: "Raise importance of compliance-gate tasks and place them in Do First or Schedule.",
      evaluate: (data) => {
        const mandatory = data.points.filter((point) => includesAny(point.label, mustDoMarkers));
        if (mandatory.length === 0) {
          return { score: 1 };
        }

        const invalid = mandatory.filter(
          (point) => point.quadrant === "delegate" || point.quadrant === "eliminate",
        ).length;

        const score = 1 - ratio(invalid, mandatory.length);
        return invalid > 0
          ? { score, issue: `${invalid} mandatory tasks were deprioritized into delegate/eliminate.` }
          : { score };
      },
    },
  ];
}

function swotCriteria(): Array<CriterionDefinition<SwotVizData>> {
  return [
    {
      id: "section-population",
      label: "All SWOT sections are populated",
      weight: 0.2,
      remediation: "Populate every SWOT quadrant with at least one concrete, non-placeholder item.",
      evaluate: (data) => {
        const sections = [data.strengths, data.weaknesses, data.opportunities, data.threats];
        const populated = sections.filter((section) => section.length > 0).length;
        const score = ratio(populated, sections.length);

        return populated < sections.length
          ? { score, issue: `${sections.length - populated} SWOT sections are empty.` }
          : { score };
      },
    },
    {
      id: "internal-vs-external",
      label: "Internal/external semantics align to SWOT quadrants",
      weight: 0.4,
      remediation: "Move internal items to strengths/weaknesses and external market/regulatory items to opportunities/threats.",
      evaluate: (data) => {
        const internalScore =
          (markerAlignmentScore(data.strengths, INTERNAL_MARKERS) + markerAlignmentScore(data.weaknesses, INTERNAL_MARKERS)) /
          2;
        const externalScore =
          (markerAlignmentScore(data.opportunities, EXTERNAL_MARKERS) + markerAlignmentScore(data.threats, EXTERNAL_MARKERS)) /
          2;
        const score = boundedScore((internalScore + externalScore) / 2);

        return score < PASS_THRESHOLD
          ? { score, issue: "SWOT items blur internal and external factors." }
          : { score };
      },
    },
    {
      id: "threat-not-question",
      label: "Threats are expressed as risks, not unresolved questions",
      weight: 0.2,
      remediation: "Rewrite threat entries as explicit downside risk statements with failure modes.",
      evaluate: (data) => {
        if (data.threats.length === 0) {
          return { score: 0, issue: "No threats are listed." };
        }

        const questionLike = data.threats.filter((threat) => {
          const normalized = lower(threat);
          return normalized.endsWith("?") || THREAT_QUESTION_PREFIXES.some((prefix) => normalized.startsWith(prefix));
        }).length;

        const score = 1 - ratio(questionLike, data.threats.length);
        return questionLike > 0
          ? { score, issue: `${questionLike} threat entries are phrased as unresolved questions.` }
          : { score };
      },
    },
    {
      id: "cross-quadrant-dedup",
      label: "Items are not duplicated across SWOT quadrants",
      weight: 0.2,
      remediation: "Deduplicate repeated entries and keep each item in the single best-fitting quadrant.",
      evaluate: (data) => {
        const all = [...data.strengths, ...data.weaknesses, ...data.opportunities, ...data.threats].map(lower);
        if (all.length === 0) {
          return { score: 0 };
        }

        const unique = new Set(all).size;
        const score = ratio(unique, all.length);

        return unique < all.length ? { score, issue: `${all.length - unique} duplicated SWOT items detected.` } : { score };
      },
    },
  ];
}

function bcgCriteria(): Array<CriterionDefinition<BcgVizData>> {
  return [
    {
      id: "quadrant-label-semantics",
      label: "Quadrant labels match BCG growth-share semantics",
      weight: 0.3,
      remediation: "Use canonical BCG labels for high-share/low-share and high-growth/low-growth quadrants.",
      evaluate: (data) => {
        const checks = [
          includesAny(data.quadrants.topLeft, ["star"]),
          includesAny(data.quadrants.topRight, ["question"]),
          includesAny(data.quadrants.bottomLeft, ["cash"]),
          includesAny(data.quadrants.bottomRight, ["dog"]),
        ];

        const passCount = checks.filter(Boolean).length;
        const score = ratio(passCount, checks.length);
        return passCount < checks.length
          ? { score, issue: "One or more BCG quadrant labels are semantically misplaced." }
          : { score };
      },
    },
    {
      id: "point-quadrant-rule",
      label: "Point quadrants match share/growth thresholds",
      weight: 0.5,
      remediation: "Recompute each BCG point quadrant from share and growth with explicit threshold rules.",
      evaluate: (data) => {
        if (data.points.length === 0) {
          return { score: 0, issue: "No BCG points were provided." };
        }

        const matches = data.points.filter((point) => {
          const expected =
            point.share < 0.5 && point.growth >= 0.5
              ? "question_marks"
              : point.share >= 0.5 && point.growth >= 0.5
                ? "stars"
                : point.share < 0.5 && point.growth < 0.5
                  ? "dogs"
                  : "cash_cows";
          return point.quadrant === expected;
        }).length;

        const score = ratio(matches, data.points.length);
        return score < 1
          ? { score, issue: `${data.points.length - matches} BCG points have inconsistent quadrant labels.` }
          : { score };
      },
    },
    {
      id: "portfolio-spread",
      label: "Portfolio spread is informative (not all points in one quadrant)",
      weight: 0.2,
      passFloor: 0.5,
      remediation: "Include at least two distinct BCG quadrants to avoid overfit narratives.",
      evaluate: (data) => {
        if (data.points.length === 0) {
          return { score: 0 };
        }

        const uniqueQuadrants = new Set(data.points.map((point) => point.quadrant)).size;
        const score = uniqueQuadrants >= 2 ? 1 : 0.5;
        return uniqueQuadrants >= 2
          ? { score }
          : { score, issue: "All points collapse into one BCG quadrant." };
      },
    },
  ];
}

function projectPortfolioCriteria(): Array<CriterionDefinition<ProjectPortfolioVizData>> {
  return [
    {
      id: "quadrant-label-semantics",
      label: "Quadrant labels align to risk/value axis semantics",
      weight: 0.35,
      remediation: "Correct project portfolio quadrant labels for top-left/top-right/bottom-left/bottom-right positions.",
      evaluate: (data) => {
        const checks = [
          includesAny(data.quadrants.topLeft, ["high value", "low risk"]),
          includesAny(data.quadrants.topRight, ["high value", "high risk"]),
          includesAny(data.quadrants.bottomLeft, ["low value", "low risk"]),
          includesAny(data.quadrants.bottomRight, ["low value", "high risk"]),
        ];

        const passCount = checks.filter(Boolean).length;
        const score = ratio(passCount, checks.length);

        return passCount < checks.length
          ? { score, issue: "Project portfolio quadrant labels do not match axis meanings." }
          : { score };
      },
    },
    {
      id: "point-quadrant-rule",
      label: "Point labels match risk/value thresholds",
      weight: 0.4,
      remediation: "Recompute each project quadrant label from risk and strategic value thresholds.",
      evaluate: (data) => {
        if (data.points.length === 0) {
          return { score: 0, issue: "No portfolio points are present." };
        }

        const matches = data.points.filter((point) => {
          const expected =
            point.value >= 0.5 && point.risk >= 0.5
              ? "High Value, High Risk"
              : point.value < 0.5 && point.risk >= 0.5
                ? "Low Value, High Risk"
                : point.value >= 0.5 && point.risk < 0.5
                  ? "High Value, Low Risk"
                  : "Low Value, Low Risk";
          return lower(point.quadrant) === lower(expected);
        }).length;

        const score = ratio(matches, data.points.length);
        return score < 1
          ? { score, issue: `${data.points.length - matches} points have inconsistent portfolio quadrants.` }
          : { score };
      },
    },
    {
      id: "probability-risk-coherence",
      label: "Success probability is coherent with risk levels",
      weight: 0.25,
      remediation: "Lower success probability for high-risk options or add explicit mitigation assumptions.",
      evaluate: (data) => {
        if (data.points.length === 0) {
          return { score: 0 };
        }

        const outliers = data.points.filter((point) => point.risk >= 0.75 && point.probability >= 0.8).length;
        const score = 1 - ratio(outliers, data.points.length);

        return outliers > 0
          ? { score, issue: `${outliers} high-risk projects show implausibly high success probability.` }
          : { score };
      },
    },
  ];
}

function paretoCriteria(): Array<CriterionDefinition<ParetoVizData>> {
  return [
    {
      id: "descending-contribution",
      label: "Contributions are sorted descending",
      weight: 0.35,
      remediation: "Sort Pareto bars by descending contribution before plotting cumulative line.",
      evaluate: (data) => {
        if (data.factors.length === 0) {
          return { score: 0, issue: "No Pareto factors available." };
        }

        let violations = 0;
        for (let index = 1; index < data.factors.length; index += 1) {
          if (data.factors[index].contribution > data.factors[index - 1].contribution + 1e-9) {
            violations += 1;
          }
        }

        const score = 1 - ratio(violations, Math.max(data.factors.length - 1, 1));
        return violations > 0
          ? { score, issue: `${violations} Pareto bars are out of descending order.` }
          : { score };
      },
    },
    {
      id: "cumulative-integrity",
      label: "Cumulative line is monotonic and reaches ~100%",
      weight: 0.35,
      remediation: "Recompute cumulative contributions from normalized factor weights.",
      evaluate: (data) => {
        if (data.factors.length === 0) {
          return { score: 0 };
        }

        let monotonicViolations = 0;
        for (let index = 1; index < data.factors.length; index += 1) {
          if (data.factors[index].cumulative + 1e-9 < data.factors[index - 1].cumulative) {
            monotonicViolations += 1;
          }
        }

        const tail = data.factors[data.factors.length - 1]?.cumulative ?? 0;
        const tailScore = Math.max(0, 1 - Math.abs(1 - tail) / 0.15);
        const monotonicScore = 1 - ratio(monotonicViolations, Math.max(data.factors.length - 1, 1));
        const score = boundedScore((tailScore + monotonicScore) / 2);

        return score < PASS_THRESHOLD
          ? { score, issue: "Pareto cumulative line is not monotonic or does not converge near 100%." }
          : { score };
      },
    },
    {
      id: "vital-few-coverage",
      label: "80/20 concentration is represented",
      weight: 0.3,
      remediation: "Rebalance factor contributions so a minority of factors drives the 80% threshold.",
      evaluate: (data) => {
        if (data.factors.length === 0) {
          return { score: 0 };
        }

        const threshold = data.threshold;
        const firstHit = data.factors.findIndex((factor) => factor.cumulative >= threshold);
        if (firstHit < 0) {
          return { score: 0.4, issue: "Pareto threshold is never reached by cumulative factors." };
        }

        const ratioAtThreshold = (firstHit + 1) / data.factors.length;
        const score = ratioAtThreshold <= 0.4 ? 1 : Math.max(0.4, 1 - (ratioAtThreshold - 0.4) / 0.6);
        return ratioAtThreshold <= 0.4
          ? { score }
          : { score, issue: "Too many factors are needed to reach Pareto threshold; concentration is weak." };
      },
    },
  ];
}

function hypeCriteria(): Array<CriterionDefinition<HypeCycleVizData>> {
  return [
    {
      id: "canonical-phase-order",
      label: "Hype phases follow canonical order",
      weight: 0.4,
      remediation: "Use canonical Gartner-style phase names and sequence for the curve.",
      evaluate: (data) => {
        if (data.phases.length < 5) {
          return { score: 0, issue: "Hype curve has fewer than 5 canonical phases." };
        }

        const matches = CANONICAL_HYPE_PHASES.filter((phase, index) => lower(data.phases[index]?.phase ?? "") === lower(phase)).length;
        const score = ratio(matches, CANONICAL_HYPE_PHASES.length);

        return score < 1
          ? { score, issue: "Hype phase naming/order diverges from canonical sequence." }
          : { score };
      },
    },
    {
      id: "current-phase-consistency",
      label: "Current point phase matches x-position",
      weight: 0.3,
      remediation: "Recompute current phase from the current x-position boundary on the hype curve.",
      evaluate: (data) => {
        const expected = data.phases
          .slice(0, Math.max(data.phases.length - 1, 1))
          .find((phase, index) => {
            const right = data.phases[index + 1];
            return right ? data.current.x <= right.x : false;
          })?.phase ?? data.phases[data.phases.length - 1]?.phase;

        if (!expected) {
          return { score: 0, issue: "Unable to derive expected hype phase from points." };
        }

        const score = lower(expected) === lower(data.current.phase) ? 1 : 0.45;
        return score < 1
          ? { score, issue: `Current phase "${data.current.phase}" does not match expected "${expected}".` }
          : { score };
      },
    },
    {
      id: "current-point-on-curve",
      label: "Current point sits on/near rendered hype curve",
      weight: 0.3,
      remediation: "Project the current point y-value from the curve interpolation at current x.",
      evaluate: (data) => {
        const segments = data.phases;
        if (segments.length < 2) {
          return { score: 0 };
        }

        let expectedY = segments[segments.length - 1].y;
        for (let index = 0; index < segments.length - 1; index += 1) {
          const left = segments[index];
          const right = segments[index + 1];
          if (data.current.x >= left.x && data.current.x <= right.x) {
            const ratioX = (data.current.x - left.x) / Math.max(right.x - left.x, 1e-9);
            expectedY = left.y + ratioX * (right.y - left.y);
            break;
          }
        }

        const distance = Math.abs(expectedY - data.current.y);
        const score = Math.max(0, 1 - distance / 0.25);
        return distance > 0.25
          ? { score, issue: "Current point deviates materially from the rendered hype curve." }
          : { score };
      },
    },
  ];
}

function chasmCriteria(): Array<CriterionDefinition<ChasmVizData>> {
  return [
    {
      id: "segment-order",
      label: "Diffusion segments follow canonical order",
      weight: 0.3,
      remediation: "Use canonical segment ordering: Innovators → Early Adopters → Early Majority → Late Majority → Laggards.",
      evaluate: (data) => {
        if (data.segments.length < CANONICAL_CHASM_SEGMENTS.length) {
          return { score: 0, issue: "Chasm model has fewer than 5 adopter segments." };
        }

        const matches = CANONICAL_CHASM_SEGMENTS.filter(
          (segment, index) => lower(data.segments[index]?.segment ?? "") === lower(segment),
        ).length;
        const score = ratio(matches, CANONICAL_CHASM_SEGMENTS.length);

        return score < 1 ? { score, issue: "Adopter segments are not in canonical order." } : { score };
      },
    },
    {
      id: "distribution-similarity",
      label: "Segment shares approximate canonical diffusion distribution",
      weight: 0.45,
      remediation: "Normalize adopter segment values to canonical diffusion shares (2.5/13.5/34/34/16).",
      evaluate: (data) => {
        const values = data.segments.map((segment) => Math.max(segment.adoption, 0));
        const sum = values.reduce((acc, value) => acc + value, 0);

        if (sum <= 1e-9 || values.length !== CANONICAL_CHASM_SHARES.length) {
          return { score: 0, issue: "Cannot compare adopter distribution to canonical shares." };
        }

        const normalized = values.map((value) => value / sum);
        const distance = normalized.reduce(
          (acc, value, index) => acc + Math.abs(value - CANONICAL_CHASM_SHARES[index]),
          0,
        );

        const score = Math.max(0, 1 - distance / 1.2);
        return score < PASS_THRESHOLD
          ? { score, issue: "Segment distribution diverges from canonical diffusion proportions." }
          : { score };
      },
    },
    {
      id: "chasm-boundary",
      label: "Chasm boundary is placed after Early Adopters",
      weight: 0.25,
      remediation: "Set the chasm boundary between Early Adopters and Early Majority.",
      evaluate: (data) => {
        const score = lower(data.chasmAfter) === "early adopters" ? 1 : 0;
        return score < 1 ? { score, issue: `chasmAfter is set to "${data.chasmAfter}".` } : { score };
      },
    },
  ];
}

function monteCarloCriteria(): Array<CriterionDefinition<MonteCarloVizData>> {
  return [
    {
      id: "bin-contiguity",
      label: "Histogram bins are contiguous over [0,1]",
      weight: 0.3,
      remediation: "Rebuild bins so each binEnd matches the next binStart and the range spans 0% to 100%.",
      evaluate: (data) => {
        if (data.bins.length < 2) {
          return { score: 0, issue: "Insufficient bins for Monte Carlo histogram." };
        }

        let violations = 0;
        if (!approxEqual(data.bins[0].binStart, 0, 0.05)) {
          violations += 1;
        }
        if (!approxEqual(data.bins[data.bins.length - 1].binEnd, 1, 0.05)) {
          violations += 1;
        }

        for (let index = 1; index < data.bins.length; index += 1) {
          if (!approxEqual(data.bins[index - 1].binEnd, data.bins[index].binStart, 0.05)) {
            violations += 1;
          }
        }

        const score = Math.max(0, 1 - violations / (data.bins.length + 1));
        return violations > 0 ? { score, issue: "Monte Carlo bins are not contiguous across the full range." } : { score };
      },
    },
    {
      id: "percentile-order",
      label: "Percentiles are ordered P10 <= P50 <= P90",
      weight: 0.3,
      remediation: "Recompute percentile markers from sorted simulation outcomes.",
      evaluate: (data) => {
        const ordered = data.p10 <= data.p50 && data.p50 <= data.p90;
        const score = ordered ? 1 : 0;
        return ordered ? { score } : { score, issue: "Monte Carlo percentiles are not properly ordered." };
      },
    },
    {
      id: "count-total-consistency",
      label: "Bin counts sum to total simulations",
      weight: 0.25,
      remediation: "Normalize/round bin counts while preserving exact total simulation count.",
      evaluate: (data) => {
        const sum = data.bins.reduce((acc, bin) => acc + bin.count, 0);
        const score = sum === data.total ? 1 : Math.max(0, 1 - Math.abs(sum - data.total) / Math.max(data.total, 1));
        return sum === data.total
          ? { score }
          : { score, issue: `Bin counts sum to ${sum}, expected ${data.total}.` };
      },
    },
    {
      id: "model-metadata",
      label: "Simulation metadata is present for traceability",
      weight: 0.15,
      remediation: "Include trial count, distribution assumptions, and correlation mode in metadata.",
      evaluate: (data) => {
        const withMeta = data as MonteCarloVizData & {
          metadata?: { trials?: number; distribution?: string; correlationMode?: string };
        };

        const meta = withMeta.metadata;
        const score = meta?.trials && meta?.distribution && meta?.correlationMode ? 1 : 0.4;
        return score < 1 ? { score, issue: "Monte Carlo metadata is incomplete." } : { score };
      },
    },
  ];
}

function consequencesCriteria(): Array<CriterionDefinition<ConsequencesVizData>> {
  return [
    {
      id: "horizon-order",
      label: "Consequence horizons follow expected temporal sequence",
      weight: 0.2,
      remediation: "Use horizons in the order Immediate → 30 Days → 90 Days → 1 Year.",
      evaluate: (data) => {
        const expected = ["immediate", "30 days", "90 days", "1 year"];
        const matches = expected.filter((label, index) => lower(data.horizons[index]?.horizon ?? "") === label).length;
        const score = ratio(matches, expected.length);

        return score < 1 ? { score, issue: "Consequence horizons are out of canonical order." } : { score };
      },
    },
    {
      id: "order-pattern",
      label: "First-order effects decay while higher-order effects increase",
      weight: 0.35,
      remediation: "Rebalance horizon curves so direct impact tapers while second/third-order effects compound over time.",
      evaluate: (data) => {
        if (data.horizons.length < 2) {
          return { score: 0 };
        }

        let directViolations = 0;
        let indirectViolations = 0;
        let thirdViolations = 0;

        for (let index = 1; index < data.horizons.length; index += 1) {
          const prev = data.horizons[index - 1];
          const current = data.horizons[index];

          if (current.direct > prev.direct + 1e-9) {
            directViolations += 1;
          }
          if (current.indirect + 1e-9 < prev.indirect) {
            indirectViolations += 1;
          }

          const prevThird = prev.thirdOrder ?? prev.indirect * 0.65;
          const currentThird = current.thirdOrder ?? current.indirect * 0.65;
          if (currentThird + 1e-9 < prevThird) {
            thirdViolations += 1;
          }
        }

        const checks = Math.max(data.horizons.length - 1, 1) * 3;
        const violations = directViolations + indirectViolations + thirdViolations;
        const score = Math.max(0, 1 - violations / checks);

        return violations > 0
          ? { score, issue: "Consequence order curves do not reflect first/second/third-order dynamics." }
          : { score };
      },
    },
    {
      id: "third-order-presence",
      label: "Third-order consequences are explicitly represented",
      weight: 0.25,
      remediation: "Add third-order impact values to each horizon and include them in net impact.",
      evaluate: (data) => {
        const withThird = data.horizons.filter((horizon) => typeof horizon.thirdOrder === "number").length;
        const score = ratio(withThird, data.horizons.length);

        return withThird < data.horizons.length
          ? { score, issue: `${data.horizons.length - withThird} horizons are missing third-order impact values.` }
          : { score };
      },
    },
    {
      id: "net-consistency",
      label: "Net impact aligns with first/second/third-order values",
      weight: 0.2,
      remediation: "Recompute net impact consistently from direct, indirect, and third-order terms.",
      evaluate: (data) => {
        if (data.horizons.length === 0) {
          return { score: 0 };
        }

        let totalDelta = 0;
        for (const horizon of data.horizons) {
          const third = horizon.thirdOrder ?? 0;
          const expected = horizon.direct - horizon.indirect - third * 0.5;
          totalDelta += Math.abs(expected - horizon.net);
        }

        const meanDelta = totalDelta / data.horizons.length;
        const score = Math.max(0, 1 - meanDelta / 0.35);
        return score < PASS_THRESHOLD
          ? { score, issue: "Net consequence values are not consistent with order-effect components." }
          : { score };
      },
    },
  ];
}

function crossroadsCriteria(): Array<CriterionDefinition<CrossroadsVizData>> {
  return [
    {
      id: "option-count",
      label: "At least two options are represented",
      weight: 0.25,
      remediation: "Include multiple viable branches so the crossroads model can compare tradeoffs.",
      evaluate: (data) => {
        const score = data.options.length >= 2 ? 1 : 0;
        return score < 1 ? { score, issue: "Crossroads model has fewer than two options." } : { score };
      },
    },
    {
      id: "reversibility-bubble",
      label: "Bubble size tracks reversibility",
      weight: 0.35,
      remediation: "Scale option bubble size directly from reversibility to communicate regret exposure.",
      evaluate: (data) => {
        if (data.options.length < 2) {
          return { score: 1 };
        }

        const sortedByRev = data.options.slice().sort((a, b) => a.reversibility - b.reversibility);
        const sortedBySize = data.options.slice().sort((a, b) => a.size - b.size);
        const rankMatches = sortedByRev.filter((option, index) => option.option === sortedBySize[index]?.option).length;
        const score = ratio(rankMatches, data.options.length);

        return score < PASS_THRESHOLD
          ? { score, issue: "Bubble size does not consistently reflect reversibility ranking." }
          : { score };
      },
    },
    {
      id: "note-alignment",
      label: "Option notes align with feasibility/desirability position",
      weight: 0.4,
      remediation: "Rewrite option notes to match each option's feasibility/desirability profile.",
      evaluate: (data) => {
        if (data.options.length === 0) {
          return { score: 0 };
        }

        let mismatches = 0;
        for (const option of data.options) {
          const normalized = lower(option.note);
          if (option.feasibility >= 0.6 && option.desirability >= 0.6) {
            if (!includesAny(normalized, ["advance", "go", "gate"])) {
              mismatches += 1;
            }
          } else if (option.feasibility < 0.45) {
            if (!includesAny(normalized, ["proof", "feasibility", "experiment", "validate"])) {
              mismatches += 1;
            }
          } else if (!includesAny(normalized, ["viable", "controlled", "pilot", "experiment"])) {
            mismatches += 1;
          }
        }

        const score = 1 - ratio(mismatches, data.options.length);
        return mismatches > 0
          ? { score, issue: `${mismatches} option notes conflict with their plotted positions.` }
          : { score };
      },
    },
  ];
}

function conflictCriteria(): Array<CriterionDefinition<ConflictResolutionVizData>> {
  const canonicalModes = ["Competing", "Collaborating", "Compromising", "Avoiding", "Accommodating"];

  return [
    {
      id: "mode-set",
      label: "All five TKI modes are present exactly once",
      weight: 0.35,
      remediation: "Use the complete Thomas-Kilmann mode set with one entry per mode.",
      evaluate: (data) => {
        const modeSet = new Set(data.modes.map((mode) => mode.mode));
        const matches = canonicalModes.filter((mode) => modeSet.has(mode)).length;
        const score = ratio(matches, canonicalModes.length);

        return score < 1
          ? { score, issue: "Conflict model is missing one or more canonical TKI modes." }
          : { score };
      },
    },
    {
      id: "recommended-highest-suitability",
      label: "Recommended mode has highest suitability",
      weight: 0.35,
      remediation: "Set recommendedMode to the mode with the top suitability score.",
      evaluate: (data) => {
        const topMode = data.modes.slice().sort((a, b) => b.suitability - a.suitability)[0]?.mode;
        const score = topMode && lower(topMode) === lower(data.recommendedMode) ? 1 : 0;

        return score < 1
          ? { score, issue: `recommendedMode (${data.recommendedMode}) does not match highest-suitability mode (${topMode ?? "n/a"}).` }
          : { score };
      },
    },
    {
      id: "coordinate-semantics",
      label: "Mode coordinates align with TKI assertive/cooperative semantics",
      weight: 0.3,
      remediation: "Place each TKI mode in its canonical assertiveness/cooperativeness region.",
      evaluate: (data) => {
        let mismatches = 0;

        for (const mode of data.modes) {
          if (mode.mode === "Competing" && !(mode.assertiveness >= 0.6 && mode.cooperativeness < 0.4)) {
            mismatches += 1;
          }
          if (mode.mode === "Collaborating" && !(mode.assertiveness >= 0.6 && mode.cooperativeness >= 0.6)) {
            mismatches += 1;
          }
          if (mode.mode === "Avoiding" && !(mode.assertiveness < 0.4 && mode.cooperativeness < 0.4)) {
            mismatches += 1;
          }
          if (mode.mode === "Accommodating" && !(mode.assertiveness < 0.4 && mode.cooperativeness >= 0.6)) {
            mismatches += 1;
          }
        }

        const score = 1 - ratio(mismatches, Math.max(data.modes.length, 1));
        return mismatches > 0
          ? { score, issue: `${mismatches} TKI modes are plotted in non-canonical regions.` }
          : { score };
      },
    },
  ];
}

function doubleLoopCriteria(): Array<CriterionDefinition<DoubleLoopVizData>> {
  return [
    {
      id: "loop-completeness",
      label: "Each loop includes behavior, single-loop fix, and root assumption",
      weight: 0.3,
      remediation: "Ensure every loop explicitly states behavior, operational fix, and governing assumption.",
      evaluate: (data) => {
        if (data.loops.length === 0) {
          return { score: 0, issue: "No double-loop entries were generated." };
        }

        const complete = data.loops.filter(
          (loop) => loop.behavior.trim() && loop.singleLoopFix.trim() && loop.rootAssumption.trim(),
        ).length;
        const score = ratio(complete, data.loops.length);

        return score < 1
          ? { score, issue: `${data.loops.length - complete} loops are missing required fields.` }
          : { score };
      },
    },
    {
      id: "assumption-testability",
      label: "Root assumptions are testable",
      weight: 0.45,
      remediation: "Rewrite root assumptions as testable hypotheses (if/then, measurable horizon).",
      evaluate: (data) => {
        if (data.loops.length === 0) {
          return { score: 0 };
        }

        const testable = data.loops.filter((loop) => {
          const text = lower(loop.rootAssumption);
          return (text.includes("if") && text.includes("then")) || includesAny(text, ["measure", "within", "threshold"]);
        }).length;
        const score = ratio(testable, data.loops.length);

        return score < PASS_THRESHOLD
          ? { score, issue: "Root assumptions are not consistently framed as testable hypotheses." }
          : { score };
      },
    },
    {
      id: "single-loop-distinct",
      label: "Single-loop fixes are distinct from behavior statements",
      weight: 0.25,
      remediation: "Make single-loop fixes concrete process changes, not verbatim restatements of behavior.",
      evaluate: (data) => {
        if (data.loops.length === 0) {
          return { score: 0 };
        }

        const distinct = data.loops.filter(
          (loop) => lower(loop.singleLoopFix) !== lower(loop.behavior),
        ).length;
        const score = ratio(distinct, data.loops.length);

        return score < 1
          ? { score, issue: `${data.loops.length - distinct} single-loop fixes repeat the behavior verbatim.` }
          : { score };
      },
    },
  ];
}

const RUBRIC_BY_FRAMEWORK: {
  [K in Top12DeepFrameworkId]: Array<CriterionDefinition<Extract<Top12VisualizationData, { kind: K }>>>;
} = {
  eisenhower_matrix: eisenhowerCriteria(),
  swot_analysis: swotCriteria(),
  bcg_matrix: bcgCriteria(),
  project_portfolio_matrix: projectPortfolioCriteria(),
  pareto_principle: paretoCriteria(),
  hype_cycle: hypeCriteria(),
  chasm_diffusion_model: chasmCriteria(),
  monte_carlo_simulation: monteCarloCriteria(),
  consequences_model: consequencesCriteria(),
  crossroads_model: crossroadsCriteria(),
  conflict_resolution_model: conflictCriteria(),
  double_loop_learning: doubleLoopCriteria(),
};

export function scoreTop12Representation(
  frameworkId: Top12DeepFrameworkId,
  data: Top12VisualizationData,
): Top12RubricReport {
  switch (frameworkId) {
    case "eisenhower_matrix":
      return evaluateCriteria(frameworkId, data as EisenhowerVizData, RUBRIC_BY_FRAMEWORK[frameworkId]);
    case "swot_analysis":
      return evaluateCriteria(frameworkId, data as SwotVizData, RUBRIC_BY_FRAMEWORK[frameworkId]);
    case "bcg_matrix":
      return evaluateCriteria(frameworkId, data as BcgVizData, RUBRIC_BY_FRAMEWORK[frameworkId]);
    case "project_portfolio_matrix":
      return evaluateCriteria(frameworkId, data as ProjectPortfolioVizData, RUBRIC_BY_FRAMEWORK[frameworkId]);
    case "pareto_principle":
      return evaluateCriteria(frameworkId, data as ParetoVizData, RUBRIC_BY_FRAMEWORK[frameworkId]);
    case "hype_cycle":
      return evaluateCriteria(frameworkId, data as HypeCycleVizData, RUBRIC_BY_FRAMEWORK[frameworkId]);
    case "chasm_diffusion_model":
      return evaluateCriteria(frameworkId, data as ChasmVizData, RUBRIC_BY_FRAMEWORK[frameworkId]);
    case "monte_carlo_simulation":
      return evaluateCriteria(frameworkId, data as MonteCarloVizData, RUBRIC_BY_FRAMEWORK[frameworkId]);
    case "consequences_model":
      return evaluateCriteria(frameworkId, data as ConsequencesVizData, RUBRIC_BY_FRAMEWORK[frameworkId]);
    case "crossroads_model":
      return evaluateCriteria(frameworkId, data as CrossroadsVizData, RUBRIC_BY_FRAMEWORK[frameworkId]);
    case "conflict_resolution_model":
      return evaluateCriteria(frameworkId, data as ConflictResolutionVizData, RUBRIC_BY_FRAMEWORK[frameworkId]);
    case "double_loop_learning":
      return evaluateCriteria(frameworkId, data as DoubleLoopVizData, RUBRIC_BY_FRAMEWORK[frameworkId]);
    default:
      return {
        frameworkId,
        rubricVersion: TOP12_RUBRIC_VERSION,
        score: 0,
        passThreshold: PASS_THRESHOLD,
        passed: false,
        criteria: [],
        remediationPlan: ["Unsupported framework for top-12 rubric scoring."],
      };
  }
}
