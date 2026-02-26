export const FRAMEWORK_IDS = [
  "eisenhower_matrix",
  "swot_analysis",
  "bcg_matrix",
  "project_portfolio_matrix",
  "john_whitmore_model",
  "rubber_band_model",
  "feedback_model",
  "family_tree_model",
  "morphological_box_scamper",
  "esquire_gift_model",
  "consequences_model",
  "conflict_resolution_model",
  "crossroads_model",
  "flow_model",
  "johari_window",
  "cognitive_dissonance_model",
  "music_matrix",
  "unimaginable_model",
  "uffe_elbaek_model",
  "fashion_model",
  "energy_model",
  "supermemo_model",
  "political_compass",
  "personal_performance_model",
  "making_of_model",
  "personal_potential_trap",
  "hype_cycle",
  "subtle_signals_model",
  "superficial_knowledge_model",
  "swiss_cheese_model",
  "maslow_pyramids",
  "thinking_outside_the_box",
  "sinus_milieu_bourdieu_models",
  "double_loop_learning",
  "ai_discussion_model",
  "small_world_model",
  "pareto_principle",
  "long_tail_model",
  "monte_carlo_simulation",
  "black_swan_model",
  "chasm_diffusion_model",
  "black_box_model",
  "status_model",
  "prisoners_dilemma",
  "drexler_sibbet_team_performance_model",
  "team_model",
  "gap_in_the_market_model",
  "hersey_blanchard_situational_leadership",
  "role_playing_model",
  "result_optimisation_model",
] as const;

export type FrameworkId = (typeof FRAMEWORK_IDS)[number];

export const TOP_12_DEEP_FRAMEWORK_IDS = [
  "eisenhower_matrix",
  "swot_analysis",
  "bcg_matrix",
  "project_portfolio_matrix",
  "pareto_principle",
  "hype_cycle",
  "chasm_diffusion_model",
  "monte_carlo_simulation",
  "consequences_model",
  "crossroads_model",
  "conflict_resolution_model",
  "double_loop_learning",
] as const;

export type Top12DeepFrameworkId = (typeof TOP_12_DEEP_FRAMEWORK_IDS)[number];

export const TOP_12_DEEP_FRAMEWORKS = new Set<FrameworkId>(TOP_12_DEEP_FRAMEWORK_IDS);

export type ProviderPreference = "local" | "hosted" | "auto";
export type ResolvedProvider = "local" | "hosted";

export type RunStatus =
  | "queued"
  | "clarifying"
  | "analyzing"
  | "synthesizing"
  | "complete"
  | "failed";

export interface CreateDecisionInput {
  title?: string;
  prompt: string;
  alternatives?: string;
  constraints?: string;
  deadline?: string;
  stakeholders?: string;
  successCriteria?: string;
  riskTolerance?: "low" | "medium" | "high";
  budget?: string;
  timeLimit?: string;
}

export interface DecisionBrief {
  title: string;
  decisionStatement: string;
  context: string;
  alternatives: string[];
  constraints: string[];
  deadline: string | null;
  stakeholders: string[];
  successCriteria: string[];
  riskTolerance: "low" | "medium" | "high";
  budget: string | null;
  timeLimit: string | null;
  assumptions: string[];
  openQuestions: string[];
  executionSteps: string[];
}

export interface ClarificationQuestion {
  id: string;
  question: string;
  rationale: string;
  generationId?: string;
  sequence?: number;
}

export interface ClarificationAnswer {
  id: string;
  answer: string;
}

export interface ThemeVector {
  risk: number;
  urgency: number;
  opportunity: number;
  uncertainty: number;
  resources: number;
  stakeholderImpact: number;
}

export type VisualizationType =
  | "quadrant"
  | "swot"
  | "scatter"
  | "line"
  | "bar"
  | "histogram"
  | "timeline"
  | "tree"
  | "network"
  | "radar"
  | "list";

export interface EisenhowerVizData {
  kind: "eisenhower_matrix";
  quadrants: Array<{
    id: "do" | "schedule" | "delegate" | "eliminate";
    label: string;
    count: number;
    items: string[];
  }>;
  points: Array<{
    label: string;
    urgency: number;
    importance: number;
    quadrant: "do" | "schedule" | "delegate" | "eliminate";
  }>;
}

export interface SwotVizData {
  kind: "swot_analysis";
  strengths: string[];
  weaknesses: string[];
  opportunities: string[];
  threats: string[];
}

export interface BcgVizData {
  kind: "bcg_matrix";
  quadrants: {
    topLeft: string;
    topRight: string;
    bottomLeft: string;
    bottomRight: string;
  };
  points: Array<{
    id: string;
    label: string;
    share: number;
    growth: number;
    size: number;
    quadrant: "question_marks" | "stars" | "dogs" | "cash_cows";
  }>;
}

export interface ProjectPortfolioVizData {
  kind: "project_portfolio_matrix";
  quadrants: {
    topLeft: string;
    topRight: string;
    bottomLeft: string;
    bottomRight: string;
  };
  points: Array<{
    id: string;
    label: string;
    risk: number;
    value: number;
    probability: number;
    size: number;
    quadrant: string;
  }>;
}

export interface ParetoVizData {
  kind: "pareto_principle";
  factors: Array<{
    label: string;
    contribution: number;
    cumulative: number;
    detail?: string;
  }>;
  threshold: number;
}

export interface HypeCycleVizData {
  kind: "hype_cycle";
  phases: Array<{
    phase: string;
    x: number;
    y: number;
  }>;
  current: {
    label: string;
    x: number;
    y: number;
    phase: string;
  };
}

export interface ChasmVizData {
  kind: "chasm_diffusion_model";
  segments: Array<{
    segment: string;
    adoption: number;
  }>;
  chasmAfter: string;
  gap: number;
}

export interface MonteCarloVizData {
  kind: "monte_carlo_simulation";
  bins: Array<{
    binStart: number;
    binEnd: number;
    count: number;
  }>;
  total: number;
  p10: number;
  p50: number;
  p90: number;
}

export interface ConsequencesVizData {
  kind: "consequences_model";
  horizons: Array<{
    horizon: string;
    direct: number;
    indirect: number;
    net: number;
  }>;
  links: Array<{
    from: string;
    to: string;
    weight: number;
  }>;
}

export interface CrossroadsVizData {
  kind: "crossroads_model";
  options: Array<{
    option: string;
    feasibility: number;
    desirability: number;
    reversibility: number;
    size: number;
    note: string;
  }>;
}

export interface ConflictResolutionVizData {
  kind: "conflict_resolution_model";
  modes: Array<{
    mode: string;
    assertiveness: number;
    cooperativeness: number;
    suitability: number;
  }>;
  recommendedMode: string;
}

export interface DoubleLoopVizData {
  kind: "double_loop_learning";
  loops: Array<{
    behavior: string;
    outcome: string;
    singleLoopFix: string;
    rootAssumption: string;
    leverage: number;
  }>;
}

export type Top12VisualizationData =
  | EisenhowerVizData
  | SwotVizData
  | BcgVizData
  | ProjectPortfolioVizData
  | ParetoVizData
  | HypeCycleVizData
  | ChasmVizData
  | MonteCarloVizData
  | ConsequencesVizData
  | CrossroadsVizData
  | ConflictResolutionVizData
  | DoubleLoopVizData;

export interface VisualizationSpec {
  type: VisualizationType;
  title: string;
  subtitle?: string;
  xLabel?: string;
  yLabel?: string;
  vizSchemaVersion?: number;
  data: unknown;
}

export interface CanonicalTop12VisualizationSpec extends VisualizationSpec {
  vizSchemaVersion: 2;
  data: Top12VisualizationData;
}

export interface FrameworkGenerationMetadata {
  mode: "llm" | "fallback";
  provider?: string;
  model?: string;
  warning?: string;
}

export interface FrameworkResult {
  frameworkId: FrameworkId;
  frameworkName: string;
  applicabilityScore: number;
  confidence: number;
  insights: string[];
  actions: string[];
  risks: string[];
  assumptions: string[];
  themes: ThemeVector;
  vizPayload: VisualizationSpec;
  deepSupported: boolean;
  generation?: FrameworkGenerationMetadata;
}

export interface PropagatedMapNode {
  id: FrameworkId;
  label: string;
  category: string;
  deepSupported: boolean;
  applicabilityScore: number;
  confidence: number;
  themes: ThemeVector;
}

export interface PropagatedMapEdge {
  source: FrameworkId;
  target: FrameworkId;
  relationType: "consensus" | "conflict" | "related";
  weight: number;
  rationale: string;
}

export interface PropagatedDecisionMap {
  nodes: PropagatedMapNode[];
  edges: PropagatedMapEdge[];
  clusters: Array<{ category: string; frameworkIds: FrameworkId[] }>;
  conflicts: PropagatedMapEdge[];
  consensus: PropagatedMapEdge[];
}

export interface SynthesisSummary {
  topFrameworks: Array<{
    frameworkId: FrameworkId;
    frameworkName: string;
    compositeScore: number;
    reason: string;
  }>;
  contradictions: Array<{
    sourceFrameworkId: FrameworkId;
    targetFrameworkId: FrameworkId;
    reason: string;
  }>;
  recommendedActions: string[];
  checkpoints: string[];
  decisionRecommendation?: DecisionRecommendation;
  warnings?: string[];
}

export interface DecisionOptionScore {
  option: string;
  score: number;
  confidence: number;
  rationale: string;
}

export interface DecisionRecommendation {
  recommendedOption: string;
  confidence: number;
  rationale: string;
  tradeoffs: string[];
  nextActions: string[];
  optionScores: DecisionOptionScore[];
}

export interface DecisionRunStatus {
  runId: string;
  decisionId: string;
  provider: string;
  model: string | null;
  status: RunStatus;
  error: string | null;
  startedAt: string | null;
  endedAt: string | null;
  frameworkCount: number;
  completedFrameworkCount: number;
}

export interface ClarificationGenerationSnapshot {
  generationId: string;
  questions: Array<{
    id: string;
    question: string;
    rationale: string;
    answer: string | null;
    status: string;
    sequence: number;
  }>;
}

export interface ExportManifest {
  decisionId: string;
  runId: string;
  generatedAt: string;
  markdownPath: string;
  assets: Array<{
    frameworkId: string;
    svgPath: string;
    pngPath: string;
  }>;
}

export interface FrameworkDefinition {
  id: FrameworkId;
  name: string;
  category: string;
  maturity: "core" | "exploratory";
  deepSupported: boolean;
  description: string;
  promptTemplate: string;
  themeWeights: ThemeVector;
}
