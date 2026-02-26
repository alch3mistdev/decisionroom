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

export const TOP_12_DEEP_FRAMEWORKS = new Set<FrameworkId>([
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
]);

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

export interface VisualizationSpec {
  type:
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
  title: string;
  subtitle?: string;
  xLabel?: string;
  yLabel?: string;
  data: unknown;
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
