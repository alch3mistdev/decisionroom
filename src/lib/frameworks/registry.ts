import type { FrameworkDefinition, FrameworkId, ThemeVector } from "@/lib/types";
import { FRAMEWORK_IDS, TOP_12_DEEP_FRAMEWORKS } from "@/lib/types";

interface RegistrySeed {
  id: FrameworkId;
  name: string;
  category: string;
  description: string;
  maturity: "core" | "exploratory";
  themeWeights: ThemeVector;
}

const t = (
  risk: number,
  urgency: number,
  opportunity: number,
  uncertainty: number,
  resources: number,
  stakeholderImpact: number,
): ThemeVector => ({
  risk,
  urgency,
  opportunity,
  uncertainty,
  resources,
  stakeholderImpact,
});

const seeds: RegistrySeed[] = [
  {
    id: "eisenhower_matrix",
    name: "Eisenhower Matrix",
    category: "prioritization",
    description: "Prioritize tasks by urgency and importance.",
    maturity: "core",
    themeWeights: t(0.42, 0.95, 0.6, 0.3, 0.45, 0.5),
  },
  {
    id: "swot_analysis",
    name: "SWOT Analysis",
    category: "strategy",
    description: "Assess strengths, weaknesses, opportunities, and threats.",
    maturity: "core",
    themeWeights: t(0.7, 0.45, 0.85, 0.6, 0.55, 0.65),
  },
  {
    id: "bcg_matrix",
    name: "BCG Box (Matrix)",
    category: "portfolio",
    description: "Map units by market growth and relative share.",
    maturity: "core",
    themeWeights: t(0.55, 0.5, 0.9, 0.5, 0.7, 0.5),
  },
  {
    id: "project_portfolio_matrix",
    name: "Project Portfolio Matrix",
    category: "portfolio",
    description: "Compare projects by value, risk, and strategic fit.",
    maturity: "core",
    themeWeights: t(0.66, 0.6, 0.78, 0.55, 0.75, 0.6),
  },
  {
    id: "john_whitmore_model",
    name: "John Whitmore Model",
    category: "coaching",
    description: "Validate whether the chosen goal is the right one.",
    maturity: "exploratory",
    themeWeights: t(0.4, 0.4, 0.65, 0.45, 0.35, 0.7),
  },
  {
    id: "rubber_band_model",
    name: "Rubber Band Model",
    category: "dilemmas",
    description: "Evaluate tensions between two competing options.",
    maturity: "exploratory",
    themeWeights: t(0.58, 0.52, 0.62, 0.55, 0.4, 0.72),
  },
  {
    id: "feedback_model",
    name: "Feedback Model",
    category: "communication",
    description: "Interpret praise and criticism with structure.",
    maturity: "exploratory",
    themeWeights: t(0.35, 0.35, 0.4, 0.5, 0.25, 0.8),
  },
  {
    id: "family_tree_model",
    name: "Family Tree Model",
    category: "network",
    description: "Map key contacts and relationship influence.",
    maturity: "exploratory",
    themeWeights: t(0.3, 0.28, 0.45, 0.35, 0.2, 0.9),
  },
  {
    id: "morphological_box_scamper",
    name: "Morphological Box & SCAMPER",
    category: "creativity",
    description: "Generate and combine structured idea variations.",
    maturity: "core",
    themeWeights: t(0.32, 0.44, 0.92, 0.6, 0.48, 0.52),
  },
  {
    id: "esquire_gift_model",
    name: "Esquire Gift Model",
    category: "personal_finance",
    description: "Calibrate spending decisions for gifts.",
    maturity: "exploratory",
    themeWeights: t(0.46, 0.35, 0.4, 0.25, 0.68, 0.6),
  },
  {
    id: "consequences_model",
    name: "Consequences Model",
    category: "risk",
    description: "Evaluate first and second-order impacts of decisions.",
    maturity: "core",
    themeWeights: t(0.9, 0.65, 0.65, 0.75, 0.55, 0.8),
  },
  {
    id: "conflict_resolution_model",
    name: "Conflict Resolution Model",
    category: "collaboration",
    description: "Resolve disagreements while preserving outcomes and trust.",
    maturity: "core",
    themeWeights: t(0.62, 0.58, 0.56, 0.5, 0.45, 0.95),
  },
  {
    id: "crossroads_model",
    name: "Crossroads Model",
    category: "decision",
    description: "Choose between alternatives at strategic turning points.",
    maturity: "core",
    themeWeights: t(0.7, 0.7, 0.75, 0.68, 0.57, 0.72),
  },
  {
    id: "flow_model",
    name: "Flow Model",
    category: "wellbeing",
    description: "Identify conditions that maximize engagement and happiness.",
    maturity: "exploratory",
    themeWeights: t(0.22, 0.28, 0.62, 0.4, 0.3, 0.52),
  },
  {
    id: "johari_window",
    name: "Johari Window",
    category: "self_awareness",
    description: "Explore known and unknown perceptions between self and others.",
    maturity: "exploratory",
    themeWeights: t(0.34, 0.3, 0.48, 0.52, 0.2, 0.88),
  },
  {
    id: "cognitive_dissonance_model",
    name: "Cognitive Dissonance Model",
    category: "behavior",
    description: "Explain and reduce conflict between beliefs and actions.",
    maturity: "exploratory",
    themeWeights: t(0.5, 0.35, 0.4, 0.66, 0.25, 0.62),
  },
  {
    id: "music_matrix",
    name: "Music Matrix",
    category: "culture",
    description: "Interpret preference signals through music choices.",
    maturity: "exploratory",
    themeWeights: t(0.2, 0.2, 0.38, 0.28, 0.2, 0.45),
  },
  {
    id: "unimaginable_model",
    name: "Unimaginable Model",
    category: "beliefs",
    description: "Surface beliefs that are hard to empirically verify.",
    maturity: "exploratory",
    themeWeights: t(0.58, 0.2, 0.35, 0.82, 0.2, 0.48),
  },
  {
    id: "uffe_elbaek_model",
    name: "Uffe Elbaek Model",
    category: "self_knowledge",
    description: "Framework for personal identity and values exploration.",
    maturity: "exploratory",
    themeWeights: t(0.28, 0.22, 0.5, 0.4, 0.2, 0.58),
  },
  {
    id: "fashion_model",
    name: "Fashion Model",
    category: "identity",
    description: "Analyze how clothing choices project identity and signals.",
    maturity: "exploratory",
    themeWeights: t(0.18, 0.2, 0.4, 0.32, 0.35, 0.54),
  },
  {
    id: "energy_model",
    name: "Energy Model",
    category: "wellbeing",
    description: "Track attentional presence and energy patterns.",
    maturity: "exploratory",
    themeWeights: t(0.3, 0.32, 0.46, 0.38, 0.3, 0.44),
  },
  {
    id: "supermemo_model",
    name: "SuperMemo Model",
    category: "learning",
    description: "Schedule repetition for long-term memory retention.",
    maturity: "core",
    themeWeights: t(0.2, 0.5, 0.44, 0.35, 0.45, 0.3),
  },
  {
    id: "political_compass",
    name: "Political Compass",
    category: "positioning",
    description: "Map political viewpoints across key ideological axes.",
    maturity: "core",
    themeWeights: t(0.44, 0.25, 0.4, 0.46, 0.2, 0.8),
  },
  {
    id: "personal_performance_model",
    name: "Personal Performance Model",
    category: "career",
    description: "Evaluate whether it is the right time to change jobs.",
    maturity: "core",
    themeWeights: t(0.45, 0.5, 0.58, 0.45, 0.55, 0.66),
  },
  {
    id: "making_of_model",
    name: "Making-of Model",
    category: "reflection",
    description: "Use past events to better understand future trajectories.",
    maturity: "exploratory",
    themeWeights: t(0.32, 0.24, 0.48, 0.4, 0.25, 0.42),
  },
  {
    id: "personal_potential_trap",
    name: "Personal Potential Trap",
    category: "psychology",
    description: "Spot risks from unrealistic self-expectations.",
    maturity: "exploratory",
    themeWeights: t(0.5, 0.34, 0.4, 0.55, 0.28, 0.52),
  },
  {
    id: "hype_cycle",
    name: "Hype Cycle",
    category: "innovation",
    description: "Estimate technology maturity and expectation curve position.",
    maturity: "core",
    themeWeights: t(0.62, 0.56, 0.82, 0.8, 0.5, 0.46),
  },
  {
    id: "subtle_signals_model",
    name: "Subtle Signals Model",
    category: "communication",
    description: "Recognize nuance and weak cues in social interactions.",
    maturity: "exploratory",
    themeWeights: t(0.35, 0.2, 0.38, 0.55, 0.2, 0.76),
  },
  {
    id: "superficial_knowledge_model",
    name: "Superficial Knowledge Model",
    category: "knowledge",
    description: "Detect noise and irrelevant information in discussions.",
    maturity: "exploratory",
    themeWeights: t(0.4, 0.28, 0.45, 0.6, 0.2, 0.5),
  },
  {
    id: "swiss_cheese_model",
    name: "Swiss Cheese Model",
    category: "risk",
    description: "Model how layered failures align into incidents.",
    maturity: "core",
    themeWeights: t(0.95, 0.6, 0.42, 0.75, 0.58, 0.5),
  },
  {
    id: "maslow_pyramids",
    name: "Maslow Pyramids",
    category: "needs",
    description: "Differentiate fundamental needs from higher-level wants.",
    maturity: "core",
    themeWeights: t(0.3, 0.25, 0.5, 0.35, 0.55, 0.82),
  },
  {
    id: "thinking_outside_the_box",
    name: "Thinking Outside the Box",
    category: "creativity",
    description: "Generate unconventional solution paths.",
    maturity: "core",
    themeWeights: t(0.3, 0.34, 0.94, 0.62, 0.35, 0.48),
  },
  {
    id: "sinus_milieu_bourdieu_models",
    name: "Sinus Milieu & Bourdieu Models",
    category: "sociology",
    description: "Segment social belonging and cultural capital patterns.",
    maturity: "exploratory",
    themeWeights: t(0.34, 0.2, 0.55, 0.45, 0.3, 0.86),
  },
  {
    id: "double_loop_learning",
    name: "Double-Loop Learning",
    category: "learning",
    description: "Correct outcomes by revisiting underlying assumptions.",
    maturity: "core",
    themeWeights: t(0.7, 0.5, 0.65, 0.7, 0.4, 0.66),
  },
  {
    id: "ai_discussion_model",
    name: "AI Discussion Model",
    category: "ai_governance",
    description: "Classify discussion types for AI-enabled decision processes.",
    maturity: "exploratory",
    themeWeights: t(0.5, 0.45, 0.75, 0.65, 0.4, 0.55),
  },
  {
    id: "small_world_model",
    name: "Small-World Model",
    category: "network",
    description: "Analyze how local clusters connect across larger systems.",
    maturity: "exploratory",
    themeWeights: t(0.32, 0.2, 0.56, 0.4, 0.2, 0.72),
  },
  {
    id: "pareto_principle",
    name: "Pareto Principle",
    category: "optimization",
    description: "Focus effort on the few inputs driving most outcomes.",
    maturity: "core",
    themeWeights: t(0.45, 0.7, 0.82, 0.35, 0.9, 0.42),
  },
  {
    id: "long_tail_model",
    name: "Long-Tail Model",
    category: "market",
    description: "Assess value in niche demand beyond mainstream hits.",
    maturity: "core",
    themeWeights: t(0.42, 0.35, 0.8, 0.55, 0.63, 0.4),
  },
  {
    id: "monte_carlo_simulation",
    name: "Monte Carlo Simulation",
    category: "quantitative",
    description: "Approximate uncertain outcomes by repeated simulation.",
    maturity: "core",
    themeWeights: t(0.8, 0.56, 0.6, 0.95, 0.62, 0.36),
  },
  {
    id: "black_swan_model",
    name: "Black Swan Model",
    category: "risk",
    description: "Stress-test for rare, high-impact unknown events.",
    maturity: "core",
    themeWeights: t(0.96, 0.46, 0.5, 0.98, 0.45, 0.4),
  },
  {
    id: "chasm_diffusion_model",
    name: "Chasm / Diffusion Model",
    category: "innovation",
    description: "Track innovation adoption through audience segments.",
    maturity: "core",
    themeWeights: t(0.55, 0.52, 0.86, 0.72, 0.6, 0.68),
  },
  {
    id: "black_box_model",
    name: "Black Box Model",
    category: "systems",
    description: "Reason about systems with hidden internal mechanisms.",
    maturity: "exploratory",
    themeWeights: t(0.58, 0.3, 0.5, 0.88, 0.35, 0.4),
  },
  {
    id: "status_model",
    name: "Status Model",
    category: "social_dynamics",
    description: "Understand status drivers and perceived winners.",
    maturity: "exploratory",
    themeWeights: t(0.3, 0.28, 0.45, 0.4, 0.3, 0.75),
  },
  {
    id: "prisoners_dilemma",
    name: "Prisoner's Dilemma",
    category: "game_theory",
    description: "Evaluate cooperation and trust under strategic tension.",
    maturity: "core",
    themeWeights: t(0.6, 0.52, 0.62, 0.58, 0.35, 0.88),
  },
  {
    id: "drexler_sibbet_team_performance_model",
    name: "Drexler-Sibbet Team Performance Model",
    category: "team",
    description: "Assess team progression across development stages.",
    maturity: "core",
    themeWeights: t(0.45, 0.5, 0.58, 0.52, 0.4, 0.9),
  },
  {
    id: "team_model",
    name: "Team Model",
    category: "team",
    description: "Evaluate collective capability and execution readiness.",
    maturity: "core",
    themeWeights: t(0.48, 0.55, 0.62, 0.48, 0.5, 0.86),
  },
  {
    id: "gap_in_the_market_model",
    name: "Gap-in-the-Market Model",
    category: "opportunity",
    description: "Find underserved demand and viable business openings.",
    maturity: "core",
    themeWeights: t(0.5, 0.46, 0.94, 0.65, 0.58, 0.6),
  },
  {
    id: "hersey_blanchard_situational_leadership",
    name: "Hersey-Blanchard (Situational Leadership)",
    category: "leadership",
    description: "Adapt leadership style to team readiness.",
    maturity: "core",
    themeWeights: t(0.42, 0.48, 0.56, 0.45, 0.32, 0.92),
  },
  {
    id: "role_playing_model",
    name: "Role-Playing Model",
    category: "empathy",
    description: "Shift perspective to understand opposing views.",
    maturity: "exploratory",
    themeWeights: t(0.34, 0.24, 0.48, 0.4, 0.25, 0.9),
  },
  {
    id: "result_optimisation_model",
    name: "Result Optimisation Model",
    category: "operations",
    description: "Manage delays and constraints to maximize outcomes.",
    maturity: "core",
    themeWeights: t(0.66, 0.75, 0.74, 0.6, 0.82, 0.54),
  },
];

export const FRAMEWORK_REGISTRY: FrameworkDefinition[] = seeds.map((seed) => ({
  ...seed,
  deepSupported: TOP_12_DEEP_FRAMEWORKS.has(seed.id),
  promptTemplate: `Apply ${seed.name} to the decision brief. Return structured insights, actions, risks, and assumptions.`,
}));

if (FRAMEWORK_REGISTRY.length !== FRAMEWORK_IDS.length) {
  throw new Error(
    `Framework registry mismatch: expected ${FRAMEWORK_IDS.length}, received ${FRAMEWORK_REGISTRY.length}`,
  );
}

export function listFrameworkDefinitions(): FrameworkDefinition[] {
  return FRAMEWORK_REGISTRY;
}

export function getFrameworkDefinition(id: FrameworkId): FrameworkDefinition {
  const found = FRAMEWORK_REGISTRY.find((framework) => framework.id === id);
  if (!found) {
    throw new Error(`Unknown framework id: ${id}`);
  }

  return found;
}

export function deepFrameworkCount(): number {
  return FRAMEWORK_REGISTRY.filter((framework) => framework.deepSupported).length;
}
