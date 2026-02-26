import type {
  DecisionBrief,
  ExportManifest,
  FrameworkResult,
  PropagatedDecisionMap,
  SynthesisSummary,
} from "@/lib/types";

interface MarkdownInput {
  decisionId: string;
  runId: string;
  brief: DecisionBrief;
  frameworkResults: FrameworkResult[];
  propagatedMap: PropagatedDecisionMap;
  synthesis: SynthesisSummary;
  manifest: ExportManifest;
}

function bullets(lines: string[]): string {
  return lines.map((line) => `- ${line}`).join("\n");
}

export function renderMarkdownReport(input: MarkdownInput): string {
  const date = new Date().toISOString();

  const frameworkSections = input.frameworkResults
    .map((result) => {
      return [
        `### ${result.frameworkName}`,
        `- Applicability: ${(result.applicabilityScore * 100).toFixed(1)}%`,
        `- Confidence: ${(result.confidence * 100).toFixed(1)}%`,
        "",
        "**Insights**",
        bullets(result.insights),
        "",
        "**Recommended Actions**",
        bullets(result.actions),
        "",
        "**Risks**",
        bullets(result.risks),
      ].join("\n");
    })
    .join("\n\n");

  return [
    `# Decision Report: ${input.brief.title}`,
    "",
    `- Decision ID: ${input.decisionId}`,
    `- Run ID: ${input.runId}`,
    `- Generated: ${date}`,
    "",
    "## Decision Brief",
    `- Statement: ${input.brief.decisionStatement}`,
    `- Context: ${input.brief.context}`,
    `- Risk tolerance: ${input.brief.riskTolerance}`,
    input.brief.deadline ? `- Deadline: ${input.brief.deadline}` : "- Deadline: not set",
    input.brief.budget ? `- Budget: ${input.brief.budget}` : "- Budget: not set",
    input.brief.timeLimit ? `- Time limit: ${input.brief.timeLimit}` : "- Time limit: not set",
    "",
    "### Constraints",
    bullets(input.brief.constraints),
    "",
    "### Alternatives",
    bullets(
      input.brief.alternatives.length > 0
        ? input.brief.alternatives
        : ["No explicit alternatives provided in the brief."],
    ),
    "",
    "### Stakeholders",
    bullets(input.brief.stakeholders),
    "",
    "### Success Criteria",
    bullets(input.brief.successCriteria),
    "",
    "## Framework Results",
    frameworkSections,
    "",
    "## Propagated Map Summary",
    `- Nodes: ${input.propagatedMap.nodes.length}`,
    `- Edges: ${input.propagatedMap.edges.length}`,
    `- Consensus edges: ${input.propagatedMap.consensus.length}`,
    `- Conflict edges: ${input.propagatedMap.conflicts.length}`,
    "",
    "## Synthesis",
    "### Top Frameworks",
    bullets(
      input.synthesis.topFrameworks.map(
        (framework) => `${framework.frameworkName} (${(framework.compositeScore * 100).toFixed(1)}%): ${framework.reason}`,
      ),
    ),
    "",
    "### Contradictions",
    bullets(
      input.synthesis.contradictions.length > 0
        ? input.synthesis.contradictions.map(
            (conflict) =>
              `${conflict.sourceFrameworkId} vs ${conflict.targetFrameworkId}: ${conflict.reason}`,
          )
        : ["No material contradictions detected."],
    ),
    "",
    "### Recommended Actions",
    bullets(input.synthesis.recommendedActions),
    "",
    "### Decision Recommendation",
    input.synthesis.decisionRecommendation
      ? `- Recommended option: ${input.synthesis.decisionRecommendation.recommendedOption}`
      : "- Recommended option: Not generated",
    input.synthesis.decisionRecommendation
      ? `- Confidence: ${(input.synthesis.decisionRecommendation.confidence * 100).toFixed(1)}%`
      : "- Confidence: n/a",
    input.synthesis.decisionRecommendation
      ? `- Rationale: ${input.synthesis.decisionRecommendation.rationale}`
      : "- Rationale: n/a",
    "",
    "### Option Scores",
    bullets(
      input.synthesis.decisionRecommendation
        ? input.synthesis.decisionRecommendation.optionScores.map(
            (option) =>
              `${option.option}: ${(option.score * 100).toFixed(1)}% (confidence ${(option.confidence * 100).toFixed(
                1,
              )}%)`,
          )
        : ["No option score breakdown available."],
    ),
    "",
    "### Checkpoints",
    bullets(input.synthesis.checkpoints),
    "",
    "### Warnings",
    bullets(input.synthesis.warnings && input.synthesis.warnings.length > 0 ? input.synthesis.warnings : ["No warnings."]),
    "",
    "## Manifest",
    "```json",
    JSON.stringify(input.manifest, null, 2),
    "```",
  ].join("\n");
}
