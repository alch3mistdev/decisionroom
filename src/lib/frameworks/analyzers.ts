import { getFrameworkDefinition } from "@/lib/frameworks/registry";
import { buildCanonicalVisualizationIfTop12 } from "@/lib/frameworks/visual-builders";
import { isTop12FrameworkId, validateFrameworkViz } from "@/lib/frameworks/visual-contracts";
import { blendThemeVectors, normalizeThemeVector } from "@/lib/analysis/theme";
import type { LLMAdapter } from "@/lib/llm/base";
import { frameworkAnalysisLLMSchema } from "@/lib/schemas";
import type {
  DecisionBrief,
  FrameworkDefinition,
  FrameworkId,
  FrameworkResult,
  ThemeVector,
} from "@/lib/types";
import { TOP_12_DEEP_FRAMEWORKS } from "@/lib/types";
import { hashStringToFloat } from "@/lib/utils/hash";
import { clamp, round } from "@/lib/utils/math";

interface AnalyzerContext {
  brief: DecisionBrief;
  framework: FrameworkDefinition;
  decisionThemes: ThemeVector;
}

interface AnalyzerResultParts {
  insights: string[];
  actions: string[];
  risks: string[];
  assumptions: string[];
  vizPayload: FrameworkResult["vizPayload"];
  themes?: ThemeVector;
}

export interface LLMFrameworkAnalysisContext {
  adapter: LLMAdapter;
  provider: string;
  model: string;
}

interface FrameworkSimulationOptions {
  provider?: string;
  model?: string;
  warning?: string;
}

const THEME_KEYS: Array<keyof ThemeVector> = [
  "risk",
  "urgency",
  "opportunity",
  "uncertainty",
  "resources",
  "stakeholderImpact",
];

function themeFitScore(framework: FrameworkDefinition, decisionThemes: ThemeVector): number {
  let weighted = 0;
  let weights = 0;

  for (const key of THEME_KEYS) {
    const fw = framework.themeWeights[key];
    weighted += fw * decisionThemes[key];
    weights += fw;
  }

  return clamp(weighted / Math.max(weights, 1e-6));
}

function seededValue(seed: string, salt: string, min = 0, max = 1): number {
  const value = hashStringToFloat(seed, salt);
  return min + value * (max - min);
}

function fallbackAssumptions(brief: DecisionBrief): string[] {
  return [
    `Stakeholder alignment remains feasible across ${brief.stakeholders.length} stakeholders.`,
    "Resource constraints can be managed with phased execution.",
  ];
}

function extractAlternatives(brief: DecisionBrief): string[] {
  if (brief.alternatives.length >= 2) {
    return brief.alternatives.slice(0, 6);
  }

  const options = brief.openQuestions
    .filter((question) => question.toLowerCase().includes("option") || question.toLowerCase().includes("alternative"))
    .flatMap((question) => question.split(/[:,-]/))
    .map((part) => part.trim())
    .filter((part) => part.length > 3)
    .slice(0, 4);

  if (options.length >= 2) {
    return options;
  }

  return ["Path A", "Path B", "Path C"].slice(0, Math.max(2, brief.executionSteps.length));
}

function baseGeneric(context: AnalyzerContext, seed: string): AnalyzerResultParts {
  const fit = themeFitScore(context.framework, context.decisionThemes);

  return {
    insights: [
      `${context.framework.name} shows ${Math.round(fit * 100)}% applicability for this decision context.`,
      `Primary influence themes: ${Object.entries(context.framework.themeWeights)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
        .map(([key]) => key)
        .join(" and ")}.`,
      `This model is most useful during ${fit > 0.7 ? "initial prioritization and planning" : "secondary validation and stress-testing"}.`,
    ],
    actions: [
      `Run a focused ${context.framework.name} pass on the top ${Math.max(2, Math.min(5, context.brief.executionSteps.length))} execution steps.`,
      "Convert framework observations into one measurable checkpoint.",
      "Revisit this model after the first execution milestone.",
    ],
    risks: [
      `${context.framework.name} may overemphasize ${fit > 0.7 ? "its strongest theme" : "secondary factors"}.`,
      "Model output quality depends on the fidelity of assumptions in the brief.",
      "Single-framework use can hide contradictory insights from adjacent models.",
    ],
    assumptions: fallbackAssumptions(context.brief),
    vizPayload: {
      type: "radar",
      title: `${context.framework.name} Theme Fit`,
      data: THEME_KEYS.map((key) => ({
        axis: key,
        value: round((context.framework.themeWeights[key] + context.decisionThemes[key]) / 2, 3),
      })),
    },
    themes: normalizeThemeVector(
      blendThemeVectors(context.framework.themeWeights, context.decisionThemes, seededValue(seed, "themeBlend", 0.35, 0.65)),
    ),
  };
}

function deepEisenhower(context: AnalyzerContext, seed: string): AnalyzerResultParts {
  const tasks = context.brief.executionSteps.slice(0, 8);
  const quadrants = [
    { id: "do", label: "Do First", count: 0, items: [] as string[] },
    { id: "schedule", label: "Schedule", count: 0, items: [] as string[] },
    { id: "delegate", label: "Delegate", count: 0, items: [] as string[] },
    { id: "eliminate", label: "Eliminate", count: 0, items: [] as string[] },
  ];

  tasks.forEach((task, index) => {
    const urgency = seededValue(seed, `urgency-${index}`);
    const importance = seededValue(seed, `importance-${index}`);

    const quadrant =
      urgency >= 0.5 && importance >= 0.5
        ? quadrants[0]
        : urgency < 0.5 && importance >= 0.5
          ? quadrants[1]
          : urgency >= 0.5 && importance < 0.5
            ? quadrants[2]
            : quadrants[3];

    quadrant.count += 1;
    quadrant.items.push(task);
  });

  return {
    insights: [
      `${quadrants[0].count} tasks are both urgent and important and should be executed immediately.`,
      `${quadrants[3].count} tasks are low leverage and candidates for elimination.`,
      "Timeboxing urgent-but-low-importance tasks prevents strategic drift.",
    ],
    actions: [
      "Assign owners for all tasks in the Do First quadrant.",
      "Schedule high-importance / lower-urgency tasks into milestones.",
      "Delete or deprioritize low-impact work from current sprint scope.",
    ],
    risks: [
      "Urgency bias can pull focus away from strategic tasks.",
      "Delegated tasks may fail without explicit accountability.",
      "Quadrant assignments should be revisited each milestone.",
    ],
    assumptions: fallbackAssumptions(context.brief),
    vizPayload: {
      type: "quadrant",
      title: "Eisenhower Prioritization",
      xLabel: "Urgency",
      yLabel: "Importance",
      data: quadrants,
    },
  };
}

function deepSwot(context: AnalyzerContext): AnalyzerResultParts {
  const strengths = context.brief.successCriteria.slice(0, 3).map((criterion) => `Strength: ${criterion}`);
  const weaknesses = context.brief.constraints.slice(0, 3).map((constraint) => `Weakness: ${constraint}`);
  const opportunities = context.brief.executionSteps
    .slice(0, 3)
    .map((step) => `Opportunity unlocked by: ${step}`);
  const threats = context.brief.openQuestions.slice(0, 3).map((question) => `Threat if unanswered: ${question}`);

  return {
    insights: [
      "SWOT indicates strongest upside in execution pathways already aligned with success criteria.",
      "Primary weaknesses are constraint-driven and can be mitigated with sequencing.",
      "Threat profile concentrates around unresolved assumptions.",
    ],
    actions: [
      "Convert each weakness into one mitigation action with owner and date.",
      "Prioritize opportunities that map directly to measurable success criteria.",
      "Track top threats as explicit risk register items.",
    ],
    risks: [
      "Overstating strengths can hide structural weaknesses.",
      "Threats may materialize faster than mitigation planning cycles.",
      "Opportunity assessments can be biased by internal optimism.",
    ],
    assumptions: fallbackAssumptions(context.brief),
    vizPayload: {
      type: "swot",
      title: "SWOT Analysis",
      data: {
        strengths,
        weaknesses,
        opportunities,
        threats,
      },
    },
  };
}

function deepBcg(context: AnalyzerContext, seed: string): AnalyzerResultParts {
  const initiatives = extractAlternatives(context.brief).slice(0, 4);
  const points = initiatives.map((initiative, index) => ({
    label: initiative,
    share: round(seededValue(seed, `share-${index}`, 0.1, 1), 3),
    growth: round(seededValue(seed, `growth-${index}`, 0.05, 1), 3),
    size: round(seededValue(seed, `size-${index}`, 20, 100), 1),
  }));

  return {
    insights: [
      "Portfolio concentration should favor high-growth options with durable share potential.",
      "At least one initiative behaves as a cash-cow stabilizer for execution funding.",
      "Low-share and low-growth initiatives are candidates for early exit.",
    ],
    actions: [
      "Reallocate resources toward top-right quadrant opportunities.",
      "Define explicit guardrails for dog-category initiatives.",
      "Pair high-growth bets with one stable value stream.",
    ],
    risks: [
      "Growth assumptions may be inflated without external validation.",
      "Market share can lag despite strong internal execution.",
      "Premature divestment of low-share options can remove future optionality.",
    ],
    assumptions: fallbackAssumptions(context.brief),
    vizPayload: {
      type: "scatter",
      title: "BCG Matrix",
      xLabel: "Relative Market Share",
      yLabel: "Market Growth",
      data: points,
    },
  };
}

function deepProjectPortfolio(context: AnalyzerContext, seed: string): AnalyzerResultParts {
  const projects = context.brief.executionSteps.slice(0, 6).map((step, index) => ({
    label: `Project ${index + 1}`,
    description: step,
    value: round(seededValue(seed, `value-${index}`, 0.2, 1), 3),
    risk: round(seededValue(seed, `risk-${index}`, 0.1, 1), 3),
    effort: round(seededValue(seed, `effort-${index}`, 0.1, 1), 3),
  }));

  return {
    insights: [
      "Portfolio spread suggests balancing high-value/high-risk projects with quick wins.",
      "Effort-heavy projects should be staged after low-risk validation work.",
      "Current mix can support a staggered delivery rhythm.",
    ],
    actions: [
      "Rank projects by value-to-effort ratio before scheduling.",
      "Place high-risk/high-value projects behind readiness gates.",
      "Add monthly portfolio review checkpoints.",
    ],
    risks: [
      "Too many concurrent projects can dilute execution quality.",
      "Risk scoring can drift without post-milestone recalibration.",
      "Stakeholder pressure may bias sequencing decisions.",
    ],
    assumptions: fallbackAssumptions(context.brief),
    vizPayload: {
      type: "scatter",
      title: "Project Portfolio Matrix",
      xLabel: "Risk",
      yLabel: "Value",
      data: projects,
    },
  };
}

function deepPareto(context: AnalyzerContext, seed: string): AnalyzerResultParts {
  const factors = context.brief.executionSteps.slice(0, 8).map((step, index) => ({
    label: `Factor ${index + 1}`,
    contribution: round(seededValue(seed, `factor-${index}`, 0.04, 0.3), 3),
    detail: step,
  }));

  const sorted = [...factors].sort((a, b) => b.contribution - a.contribution);
  let cumulative = 0;
  const paretoData = sorted.map((item) => {
    cumulative += item.contribution;
    return {
      ...item,
      cumulative: round(Math.min(cumulative, 1), 3),
    };
  });

  return {
    insights: [
      "A small set of factors drives most expected outcomes.",
      "Front-loading top contributors can accelerate visible progress.",
      "Long-tail tasks should be scheduled after high-leverage wins.",
    ],
    actions: [
      "Protect resources for top 20-30% contribution factors.",
      "Demote low-contribution tasks to backlog or automation.",
      "Review contribution estimates after each iteration.",
    ],
    risks: [
      "Incorrect contribution estimates can misallocate resources.",
      "Overfocusing on top factors can ignore hidden dependencies.",
      "Cumulative impact can flatten if top factors stall.",
    ],
    assumptions: fallbackAssumptions(context.brief),
    vizPayload: {
      type: "bar",
      title: "Pareto Impact Curve",
      xLabel: "Factors",
      yLabel: "Contribution",
      data: paretoData,
    },
  };
}

function deepHypeCycle(context: AnalyzerContext, seed: string): AnalyzerResultParts {
  const position = round(seededValue(seed, "hype-position", 0.1, 0.95), 3);

  const phases = [
    { phase: "Innovation Trigger", x: 0.1, y: 0.3 },
    { phase: "Peak of Inflated Expectations", x: 0.3, y: 0.95 },
    { phase: "Trough of Disillusionment", x: 0.55, y: 0.22 },
    { phase: "Slope of Enlightenment", x: 0.75, y: 0.58 },
    { phase: "Plateau of Productivity", x: 0.92, y: 0.72 },
  ];

  return {
    insights: [
      `Current initiative placement is near ${
        position < 0.3
          ? "innovation trigger"
          : position < 0.5
            ? "inflated expectations"
            : position < 0.7
              ? "disillusionment"
              : position < 0.85
                ? "enlightenment"
                : "productivity plateau"
      }.`,
      "Expectation management should be explicit in stakeholder communications.",
      "Execution milestones should prioritize evidence over narrative hype.",
    ],
    actions: [
      "Define stage-specific evidence gates for moving to the next phase.",
      "Set realistic adoption milestones for the next quarter.",
      "Track hype-vs-value deltas in decision reviews.",
    ],
    risks: [
      "Hype can distort resource allocation and timeline expectations.",
      "Trough transitions can trigger unnecessary pivots.",
      "Plateau assumptions may ignore adjacent disruption risk.",
    ],
    assumptions: fallbackAssumptions(context.brief),
    vizPayload: {
      type: "line",
      title: "Hype Cycle Positioning",
      xLabel: "Maturity",
      yLabel: "Expectations",
      data: {
        phases,
        currentPosition: position,
      },
    },
  };
}

function deepChasm(context: AnalyzerContext, seed: string): AnalyzerResultParts {
  const segments = [
    "Innovators",
    "Early Adopters",
    "Early Majority",
    "Late Majority",
    "Laggards",
  ].map((segment, index) => ({
    segment,
    adoption: round(seededValue(seed, `segment-${index}`, 0.05, 0.9), 3),
  }));

  return {
    insights: [
      "Biggest adoption risk typically sits between early adopters and early majority.",
      "Messaging and proof requirements differ sharply by segment.",
      "Execution should sequence traction-building before scale commitments.",
    ],
    actions: [
      "Design one bridge strategy specifically for the early majority segment.",
      "Document proof points that reduce perceived switching risk.",
      "Calibrate onboarding approach for segment readiness.",
    ],
    risks: [
      "Crossing-the-chasm assumptions may be optimistic without reference users.",
      "Segment blending can reduce proposition clarity.",
      "Over-optimization for laggards can stall momentum.",
    ],
    assumptions: fallbackAssumptions(context.brief),
    vizPayload: {
      type: "bar",
      title: "Diffusion / Chasm Adoption",
      xLabel: "Adopter Segment",
      yLabel: "Adoption Probability",
      data: segments,
    },
  };
}

function deepMonteCarlo(context: AnalyzerContext, seed: string): AnalyzerResultParts {
  const simulations = 350;
  const outcomes: number[] = [];

  for (let index = 0; index < simulations; index += 1) {
    const base = seededValue(seed, `mc-${index}`, 0.25, 0.85);
    const noise = seededValue(seed, `noise-${index}`, -0.2, 0.2);
    outcomes.push(clamp(base + noise));
  }

  outcomes.sort((a, b) => a - b);

  const bins = 10;
  const histogram = Array.from({ length: bins }, (_, index) => ({
    binStart: round(index / bins, 2),
    binEnd: round((index + 1) / bins, 2),
    count: 0,
  }));

  for (const outcome of outcomes) {
    const bucket = Math.min(Math.floor(outcome * bins), bins - 1);
    histogram[bucket].count += 1;
  }

  const percentile = (p: number): number => outcomes[Math.floor((simulations - 1) * p)];

  return {
    insights: [
      `P50 outcome estimate: ${Math.round(percentile(0.5) * 100)}%.`,
      `P90 downside boundary: ${Math.round(percentile(0.1) * 100)}%.`,
      "Distribution spread indicates how robust the decision is under uncertainty.",
    ],
    actions: [
      "Define contingency actions for the bottom 10% scenario.",
      "Use median scenario for base planning and P75 for stretch targets.",
      "Refresh simulation inputs after each major milestone.",
    ],
    risks: [
      "Output quality is limited by assumption quality.",
      "Correlated risks may be underrepresented in simple simulations.",
      "Overconfidence in central estimate can mask tail risks.",
    ],
    assumptions: fallbackAssumptions(context.brief),
    vizPayload: {
      type: "histogram",
      title: "Monte Carlo Outcome Distribution",
      xLabel: "Outcome Probability",
      yLabel: "Frequency",
      data: {
        bins: histogram,
        p10: round(percentile(0.1), 3),
        p50: round(percentile(0.5), 3),
        p90: round(percentile(0.9), 3),
      },
    },
  };
}

function deepConsequences(context: AnalyzerContext, seed: string): AnalyzerResultParts {
  const timeline = ["Immediate", "30 Days", "90 Days", "1 Year"].map((horizon, index) => ({
    horizon,
    positive: round(seededValue(seed, `pos-${index}`, 0.15, 0.95), 3),
    negative: round(seededValue(seed, `neg-${index}`, 0.1, 0.8), 3),
  }));

  return {
    insights: [
      "Immediate effects are manageable, but medium-term consequences require active governance.",
      "Long-horizon outcomes improve with early mitigation investments.",
      "Net consequence trend can be improved by tightening feedback loops.",
    ],
    actions: [
      "Attach a mitigation owner to each high-negative horizon.",
      "Review impact forecasts at 30/90-day checkpoints.",
      "Escalate adverse trend indicators before annual planning cycles.",
    ],
    risks: [
      "Delayed side effects can be underweighted in initial decision narratives.",
      "Consequence estimates can drift without updated evidence.",
      "Positive bias may suppress contingency planning.",
    ],
    assumptions: fallbackAssumptions(context.brief),
    vizPayload: {
      type: "timeline",
      title: "Consequences Over Time",
      xLabel: "Time Horizon",
      yLabel: "Impact Magnitude",
      data: timeline,
    },
  };
}

function deepCrossroads(context: AnalyzerContext, seed: string): AnalyzerResultParts {
  const options = extractAlternatives(context.brief).slice(0, 4).map((option, index) => ({
    option,
    desirability: round(seededValue(seed, `des-${index}`, 0.2, 1), 3),
    feasibility: round(seededValue(seed, `fea-${index}`, 0.15, 1), 3),
    reversibility: round(seededValue(seed, `rev-${index}`, 0.1, 1), 3),
  }));

  return {
    insights: [
      "Crossroads scoring favors options that blend feasibility and reversibility.",
      "Highest desirability options should still pass feasibility gates.",
      "Reversible experiments reduce regret under uncertainty.",
    ],
    actions: [
      "Advance top two options to a short experiment design.",
      "Set explicit kill criteria for low-feasibility branches.",
      "Review option scores after new evidence arrives.",
    ],
    risks: [
      "Decision paralysis can persist if too many options remain active.",
      "Feasibility assumptions can break under resource constraints.",
      "Stakeholder preference bias may distort scoring.",
    ],
    assumptions: fallbackAssumptions(context.brief),
    vizPayload: {
      type: "scatter",
      title: "Crossroads Option Map",
      xLabel: "Feasibility",
      yLabel: "Desirability",
      data: options,
    },
  };
}

function deepConflictResolution(context: AnalyzerContext, seed: string): AnalyzerResultParts {
  const stakeholders = context.brief.stakeholders.slice(0, 6);
  const matrix = stakeholders.map((stakeholder, index) => ({
    stakeholder,
    influence: round(seededValue(seed, `influence-${index}`, 0.2, 1), 3),
    alignment: round(seededValue(seed, `alignment-${index}`, 0.05, 0.95), 3),
  }));

  return {
    insights: [
      "High-influence / low-alignment stakeholders should be engaged first.",
      "Resolution momentum depends on shared success criteria and transparency.",
      "Escalation risk decreases when tradeoffs are explicit and measurable.",
    ],
    actions: [
      "Run bilateral sessions with top misaligned stakeholders.",
      "Document non-negotiables and compromise ranges.",
      "Track alignment score changes after each facilitation step.",
    ],
    risks: [
      "Ignoring low-alignment influencers can trigger implementation drag.",
      "Short-term compromise can create long-term ambiguity.",
      "Lack of neutral facilitation may reinforce positions.",
    ],
    assumptions: fallbackAssumptions(context.brief),
    vizPayload: {
      type: "bar",
      title: "Conflict Resolution Stakeholder Matrix",
      xLabel: "Stakeholder",
      yLabel: "Influence / Alignment",
      data: matrix,
    },
  };
}

function deepDoubleLoop(context: AnalyzerContext, seed: string): AnalyzerResultParts {
  const loops = context.brief.executionSteps.slice(0, 5).map((step, index) => ({
    behavior: step,
    singleLoopFix: `Optimize process: ${step}`,
    rootAssumption: context.brief.assumptions[index % Math.max(context.brief.assumptions.length, 1)] ?? "Execution logic is sound",
    leverage: round(seededValue(seed, `leverage-${index}`, 0.2, 1), 3),
  }));

  return {
    insights: [
      "Multiple issues appear to be rooted in assumption-level misalignment.",
      "Single-loop optimizations improve efficiency but may not resolve recurring failures.",
      "Double-loop corrections create stronger long-term learning effects.",
    ],
    actions: [
      "Tag recurring incidents with the underlying assumption they challenge.",
      "Run retrospectives that explicitly question governing beliefs.",
      "Prioritize high-leverage assumption updates before next iteration.",
    ],
    risks: [
      "Teams may default to surface fixes under delivery pressure.",
      "Assumption challenges can create temporary uncertainty in ownership.",
      "Without tracking, learning gains may decay between cycles.",
    ],
    assumptions: fallbackAssumptions(context.brief),
    vizPayload: {
      type: "list",
      title: "Double-Loop Learning Trace",
      data: loops,
    },
  };
}

const deepAnalyzerMap: Partial<Record<FrameworkId, (context: AnalyzerContext, seed: string) => AnalyzerResultParts>> = {
  eisenhower_matrix: deepEisenhower,
  swot_analysis: (context) => deepSwot(context),
  bcg_matrix: deepBcg,
  project_portfolio_matrix: deepProjectPortfolio,
  pareto_principle: deepPareto,
  hype_cycle: deepHypeCycle,
  chasm_diffusion_model: deepChasm,
  monte_carlo_simulation: deepMonteCarlo,
  consequences_model: deepConsequences,
  crossroads_model: deepCrossroads,
  conflict_resolution_model: deepConflictResolution,
  double_loop_learning: deepDoubleLoop,
};

function compactBriefForPrompt(brief: DecisionBrief): Record<string, unknown> {
  return {
    title: brief.title,
    decisionStatement: brief.decisionStatement,
    context: brief.context.slice(0, 1400),
    alternatives: brief.alternatives.slice(0, 6),
    constraints: brief.constraints.slice(0, 8),
    deadline: brief.deadline,
    stakeholders: brief.stakeholders.slice(0, 8),
    successCriteria: brief.successCriteria.slice(0, 8),
    riskTolerance: brief.riskTolerance,
    budget: brief.budget,
    timeLimit: brief.timeLimit,
    assumptions: brief.assumptions.slice(0, 6),
    openQuestions: brief.openQuestions.slice(0, 6),
    executionSteps: brief.executionSteps.slice(0, 8),
  };
}

export function analyzeFrameworkSimulation(
  frameworkId: FrameworkId,
  brief: DecisionBrief,
  decisionThemes: ThemeVector,
  options?: FrameworkSimulationOptions,
): FrameworkResult {
  const framework = getFrameworkDefinition(frameworkId);
  const seed = `${frameworkId}:${brief.title}:${brief.decisionStatement}`;
  const fitScore = themeFitScore(framework, decisionThemes);

  const context: AnalyzerContext = {
    brief,
    framework,
    decisionThemes,
  };

  const deepAnalyzer = deepAnalyzerMap[frameworkId];
  const parts =
    framework.deepSupported && deepAnalyzer
      ? deepAnalyzer(context, seed)
      : baseGeneric(context, seed);

  const confidence = clamp(
    (framework.deepSupported ? 0.68 : 0.56) +
      fitScore * 0.22 +
      seededValue(seed, "confidence", -0.07, 0.07),
  );

  const themes = normalizeThemeVector(
    parts.themes ?? blendThemeVectors(framework.themeWeights, decisionThemes, 0.5),
  );

  return {
    frameworkId,
    frameworkName: framework.name,
    applicabilityScore: round(fitScore, 3),
    confidence: round(confidence, 3),
    insights: parts.insights,
    actions: parts.actions,
    risks: parts.risks,
    assumptions: parts.assumptions,
    themes,
    vizPayload:
      buildCanonicalVisualizationIfTop12(frameworkId, brief, decisionThemes) ?? parts.vizPayload,
    deepSupported: TOP_12_DEEP_FRAMEWORKS.has(frameworkId),
    generation: {
      mode: "fallback",
      provider: options?.provider ?? "simulation",
      model: options?.model,
      warning: options?.warning,
    },
  };
}

export async function analyzeFrameworkWithLLM(
  frameworkId: FrameworkId,
  brief: DecisionBrief,
  decisionThemes: ThemeVector,
  llm: LLMFrameworkAnalysisContext,
): Promise<FrameworkResult> {
  const framework = getFrameworkDefinition(frameworkId);
  const fitScore = themeFitScore(framework, decisionThemes);

  const generated = await llm.adapter.generateJson({
    systemPrompt: [
      "You are a senior decision-analysis specialist.",
      "Given a framework definition and a decision brief, return strict JSON matching the schema.",
      "Keep outputs concise, specific, and execution-oriented.",
      "Scores must be in [0,1].",
      "Use visualization payloads that match the data shape and are readable by the UI.",
      "For top-12 deep frameworks, visuals are canonicalized in code; focus your strongest quality on insights/actions/risks.",
      "Keep list sizes minimal to preserve reliability: insights=3, actions=3, risks=2, assumptions=2.",
      "Keep each sentence under 180 characters.",
    ].join("\n"),
    userPrompt: [
      `Framework: ${framework.name} (${framework.id})`,
      `Framework category: ${framework.category}`,
      `Framework description: ${framework.description}`,
      `Framework deep supported: ${framework.deepSupported}`,
      `Framework theme weights: ${JSON.stringify(framework.themeWeights)}`,
      `Decision themes: ${JSON.stringify(decisionThemes)}`,
      `Decision brief compact: ${JSON.stringify(compactBriefForPrompt(brief))}`,
      "Visualization data should include at most 6 points/items.",
      "Return JSON only.",
    ].join("\n"),
    schema: frameworkAnalysisLLMSchema,
    temperature: 0.15,
    maxTokens: 1600,
  });

  const blendedApplicability = clamp(generated.applicabilityScore * 0.8 + fitScore * 0.2);
  const blendedConfidence = clamp(generated.confidence * 0.85 + fitScore * 0.15);

  return {
    frameworkId,
    frameworkName: framework.name,
    applicabilityScore: round(blendedApplicability, 3),
    confidence: round(blendedConfidence, 3),
    insights: generated.insights,
    actions: generated.actions,
    risks: generated.risks,
    assumptions: generated.assumptions,
    themes: normalizeThemeVector(generated.themes),
    vizPayload:
      buildCanonicalVisualizationIfTop12(frameworkId, brief, decisionThemes) ?? generated.vizPayload,
    deepSupported: TOP_12_DEEP_FRAMEWORKS.has(frameworkId),
    generation: {
      mode: "llm",
      provider: llm.provider,
      model: llm.model,
    },
  };
}

export function enforceFrameworkVisualizationIntegrity(
  result: FrameworkResult,
  brief: DecisionBrief,
  decisionThemes: ThemeVector,
): { result: FrameworkResult; warning?: string } {
  if (!isTop12FrameworkId(result.frameworkId)) {
    return { result };
  }

  const validation = validateFrameworkViz(result.frameworkId, result.vizPayload);
  if (validation.ok) {
    return { result };
  }

  const canonicalPayload = buildCanonicalVisualizationIfTop12(result.frameworkId, brief, decisionThemes);
  if (!canonicalPayload) {
    return { result };
  }

  const warning = `${result.frameworkName} (${result.frameworkId}) visualization payload was regenerated to canonical schema: ${validation.issues.join(" ")}`;

  return {
    result: {
      ...result,
      vizPayload: canonicalPayload,
      generation: {
        mode: result.generation?.mode ?? "fallback",
        provider: result.generation?.provider,
        model: result.generation?.model,
        warning: result.generation?.warning
          ? `${result.generation.warning} ${warning}`
          : warning,
      },
    },
    warning,
  };
}

// Backward-compatible export for simulation mode/tests.
export const analyzeFramework = analyzeFrameworkSimulation;
