import { z } from "zod";

import { ModelOutputInvalidError, ModelTimeoutError } from "@/lib/errors";
import {
  clarificationAnswerSchema,
  clarificationQuestionSchema,
  decisionBriefSchema,
  parseDelimited,
} from "@/lib/schemas";
import { resolveLLM } from "@/lib/llm/router";
import type {
  ClarificationAnswer,
  ClarificationQuestion,
  CreateDecisionInput,
  DecisionBrief,
  ProviderPreference,
} from "@/lib/types";

interface QaPair {
  question: string;
  answer: string;
}

type ResolvedLLM = Awaited<ReturnType<typeof resolveLLM>>;

const rawClarificationQuestionSchema = z.object({
  id: z.string().trim().min(1).max(120).optional(),
  question: z.string().trim().min(1).max(500),
  rationale: z.string().trim().min(1).max(600).optional(),
});

const rawClarificationResponseSchema = z.union([
  rawClarificationQuestionSchema.array().min(1).max(12),
  z.object({
    questions: rawClarificationQuestionSchema.array().min(1).max(12),
  }),
]);

type RawClarificationResponse = z.infer<typeof rawClarificationResponseSchema>;

function shortSummary(value: string, maxLength = 180): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1).trimEnd()}…`;
}

function joinForSentence(values: string[], max = 3): string {
  if (values.length === 0) {
    return "";
  }

  return values.slice(0, max).join(", ");
}

function fallbackQuestions(input: CreateDecisionInput): ClarificationQuestion[] {
  const questions: ClarificationQuestion[] = [];

  if (!input.alternatives?.trim()) {
    questions.push({
      id: "alternatives",
      question: "What are the top 2-4 concrete options you are considering?",
      rationale: "Explicit alternatives are required for a recommendation, not just analysis.",
    });
  }

  if (!input.constraints?.trim()) {
    questions.push({
      id: "constraints",
      question: "What hard constraints cannot be violated?",
      rationale: "Constraints determine feasible options and sequencing.",
    });
  }

  if (!input.deadline?.trim()) {
    questions.push({
      id: "deadline",
      question: "What is the timeline or deadline for this decision?",
      rationale: "Urgency changes prioritization and execution detail.",
    });
  }

  if (!input.stakeholders?.trim()) {
    questions.push({
      id: "stakeholders",
      question: "Who are the key stakeholders and what matters most to each?",
      rationale: "Stakeholder impact drives conflict risk and adoption.",
    });
  }

  if (!input.successCriteria?.trim()) {
    questions.push({
      id: "success",
      question: "How will you define success in measurable terms?",
      rationale: "Concrete criteria allow objective comparison of options.",
    });
  }

  if (!input.riskTolerance) {
    questions.push({
      id: "risk",
      question: "How much downside risk are you willing to accept?",
      rationale: "Risk tolerance influences option selection and safeguards.",
    });
  }

  if (!input.budget?.trim() || !input.timeLimit?.trim()) {
    questions.push({
      id: "resources",
      question: "What budget, people, and time are available for execution?",
      rationale: "Resource limits affect practical viability.",
    });
  }

  const supplementalQuestions: ClarificationQuestion[] = [
    {
      id: "tradeoffs",
      question: "What tradeoff is acceptable if your preferred option underperforms?",
      rationale: "Tradeoff boundaries improve recommendation robustness.",
    },
    {
      id: "signals",
      question: "What early signals would tell you the decision is working?",
      rationale: "Leading indicators reduce decision regret and enable quick adjustments.",
    },
    {
      id: "owners",
      question: "Who owns each critical execution step and decision checkpoint?",
      rationale: "Clear ownership reduces coordination failures and execution drift.",
    },
  ];

  for (const supplemental of supplementalQuestions) {
    if (questions.length >= 3) {
      break;
    }

    if (questions.some((question) => question.id === supplemental.id)) {
      continue;
    }

    questions.push(supplemental);
  }

  return questions.slice(0, 6);
}

function splitBullets(value: string | undefined): string[] {
  return parseDelimited(value).slice(0, 20);
}

function fallbackSuggestionForQuestion(
  question: ClarificationQuestion,
  input: CreateDecisionInput,
): string {
  const key = question.question.toLowerCase();
  const alternatives = splitBullets(input.alternatives);
  const constraints = splitBullets(input.constraints);
  const stakeholders = splitBullets(input.stakeholders);
  const successCriteria = splitBullets(input.successCriteria);
  const promptSummary = shortSummary(input.prompt);

  if (key.includes("alternative") || key.includes("option")) {
    if (alternatives.length >= 2) {
      const optionList = joinForSentence(alternatives, 4);
      return `I would compare ${optionList}. The practical next step is a phased test first, then scale only if success criteria are met.`;
    }

    return "I would evaluate at least three paths: a conservative option, a phased pilot, and a full-commitment option, then choose based on risk and execution capacity.";
  }

  if (key.includes("constraint")) {
    if (constraints.length > 0) {
      return `Non-negotiables are ${joinForSentence(constraints, 4)}. Any option should be rejected immediately if it violates one of these constraints.`;
    }

    return "Key constraints should include compliance, delivery capacity, and customer impact; options should be filtered against these before scoring.";
  }

  if (key.includes("stakeholder")) {
    if (stakeholders.length > 0) {
      return `Primary stakeholders are ${joinForSentence(stakeholders, 4)}. I would align on decision criteria first, then assign explicit owners for execution checkpoints.`;
    }

    return "Core stakeholders should include decision owner, delivery team, and impacted users; each should have clear success and risk priorities.";
  }

  if (key.includes("success")) {
    if (successCriteria.length > 0) {
      return `Success should be measured by ${joinForSentence(successCriteria, 3)} with baseline and target values defined before rollout.`;
    }

    return "Success should be defined with 2-3 measurable KPIs tied to timeline and quality thresholds.";
  }

  if (key.includes("deadline") || key.includes("timeline")) {
    if (input.deadline?.trim()) {
      return `Given the ${input.deadline.trim()} target, I would run a short pilot phase first and gate full rollout on evidence from that phase.`;
    }

    if (input.timeLimit?.trim()) {
      return `With a ${input.timeLimit.trim()} window, use weekly milestones and a go/no-go checkpoint halfway through execution.`;
    }

    return "Set a concrete deadline and divide execution into milestone gates to reduce schedule slippage.";
  }

  if (key.includes("budget") || key.includes("resource")) {
    const budget = input.budget?.trim();
    const timeLimit = input.timeLimit?.trim();
    const resourcePhrase = [budget ? `budget ${budget}` : null, timeLimit ? `timeline ${timeLimit}` : null]
      .filter(Boolean)
      .join(" and ");

    if (resourcePhrase) {
      return `Plan for ${resourcePhrase} and reserve a contingency buffer for risk mitigation and iteration after the first checkpoint.`;
    }

    return "Estimate available budget and team capacity first, then prioritize high-impact work with strict scope control.";
  }

  if (key.includes("risk")) {
    const tolerance = input.riskTolerance ?? "medium";
    if (tolerance === "low") {
      return "Given low risk tolerance, prioritize reversible options with clear rollback plans and stronger validation gates.";
    }
    if (tolerance === "high") {
      return "Given high risk tolerance, pursue the highest-upside option, but set explicit downside limits and stop-loss triggers.";
    }
    return "With medium risk tolerance, choose a phased option that balances upside with controlled downside exposure.";
  }

  if (key.includes("tradeoff")) {
    return "An acceptable tradeoff is slower speed to reduce execution risk; I would protect reliability and stakeholder trust over short-term acceleration.";
  }

  if (key.includes("signal")) {
    return "Early positive signals should include movement in leading KPIs within 2-4 weeks; negative signals should trigger scope reduction or option switch.";
  }

  return `Based on the current decision context (${promptSummary}), I would answer this by choosing the most testable option and validating it against constraints before scaling.`;
}

function fallbackSuggestions(
  input: CreateDecisionInput,
  questions: ClarificationQuestion[],
): ClarificationAnswer[] {
  return questions.map((question) => ({
    id: question.id,
    answer: fallbackSuggestionForQuestion(question, input),
  }));
}

function normalizeSuggestions(
  questions: ClarificationQuestion[],
  suggestions: ClarificationAnswer[],
): ClarificationAnswer[] {
  const suggestionMap = new Map(
    suggestions
      .filter((suggestion) => suggestion.answer.trim().length > 0)
      .map((suggestion) => [suggestion.id, suggestion.answer.trim()]),
  );

  return questions.map((question) => {
    const answer = suggestionMap.get(question.id);
    if (answer) {
      return { id: question.id, answer };
    }

    return { id: question.id, answer: "" };
  });
}

function deriveRiskTolerance(input: CreateDecisionInput, qaPairs: QaPair[]): "low" | "medium" | "high" {
  if (input.riskTolerance) {
    return input.riskTolerance;
  }

  const answerText = qaPairs.map((pair) => pair.answer.toLowerCase()).join(" ");

  if (answerText.includes("low risk") || answerText.includes("conservative")) {
    return "low";
  }

  if (answerText.includes("high risk") || answerText.includes("aggressive")) {
    return "high";
  }

  return "medium";
}

function safeQuestionId(value: string, fallbackIndex: number, used: Set<string>): string {
  const base =
    value
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/g, "_")
      .replaceAll(/^_+|_+$/g, "")
      .slice(0, 80) || `q_${fallbackIndex}`;

  let candidate = base;
  let index = 2;
  while (used.has(candidate)) {
    candidate = `${base}_${index}`;
    index += 1;
  }
  used.add(candidate);

  return candidate;
}

function normalizeClarificationQuestions(
  raw: RawClarificationResponse,
): ClarificationQuestion[] {
  const rows = Array.isArray(raw) ? raw : raw.questions;
  const usedIds = new Set<string>();
  const seenQuestions = new Set<string>();
  const normalized: ClarificationQuestion[] = [];

  for (const row of rows) {
    const questionText = row.question.trim();
    const dedupeKey = questionText.toLowerCase();
    if (seenQuestions.has(dedupeKey)) {
      continue;
    }
    seenQuestions.add(dedupeKey);

    const id = safeQuestionId(row.id ?? questionText, normalized.length + 1, usedIds);
    normalized.push({
      id,
      question: questionText,
      rationale:
        row.rationale?.trim() ||
        "Clarification needed to improve recommendation quality and execution confidence.",
    });

    if (normalized.length >= 6) {
      break;
    }
  }

  if (normalized.length < 3) {
    throw new ModelOutputInvalidError(
      "Model returned too few usable clarification questions. Please retry question generation.",
      { returnedCount: normalized.length },
    );
  }

  return normalized;
}

function isStructuredRecoveryError(error: unknown): boolean {
  return error instanceof ModelOutputInvalidError || error instanceof ModelTimeoutError;
}

async function resolveAlternateLLM(
  preference: ProviderPreference,
  currentProvider: string,
): Promise<ResolvedLLM | null> {
  if (preference !== "auto") {
    return null;
  }

  const alternatePreference =
    currentProvider === "local"
      ? "hosted"
      : currentProvider === "hosted"
        ? "local"
        : null;

  if (!alternatePreference) {
    return null;
  }

  try {
    const alternate = await resolveLLM(alternatePreference);
    if (alternate.provider === currentProvider) {
      return null;
    }
    return alternate;
  } catch {
    return null;
  }
}

async function generateClarificationQuestionsWithProvider(
  input: CreateDecisionInput,
  llm: ResolvedLLM,
): Promise<ClarificationQuestion[]> {
  let questions: ClarificationQuestion[] = [];

  try {
    questions = await requestClarificationQuestions(input, llm.adapter.generateJson.bind(llm.adapter), "first");
  } catch (error) {
    if (!(error instanceof ModelOutputInvalidError)) {
      throw error;
    }

    questions = await requestClarificationQuestions(input, llm.adapter.generateJson.bind(llm.adapter), "retry");
  }

  return clarificationQuestionSchema.array().min(3).max(6).parse(questions);
}

async function requestClarificationQuestions(
  input: CreateDecisionInput,
  generate: <T>(request: {
    systemPrompt: string;
    userPrompt: string;
    schema: z.ZodType<T>;
    temperature?: number;
    maxTokens?: number;
  }) => Promise<T>,
  pass: "first" | "retry",
): Promise<ClarificationQuestion[]> {
  const retryNote =
    pass === "retry"
      ? "Retry mode: output EXACTLY 4-6 unique question objects and include rationale for each."
      : "";

  const raw = await generate({
    systemPrompt:
      "You are a decision architect. Ask concise clarification questions that close execution gaps.",
    userPrompt: [
      "Generate up to 6 clarification questions.",
      "Each question must include: id, question, rationale.",
      "Focus on concrete options, constraints, timeline, stakeholders, success criteria, risk, and resources.",
      "Output JSON only; no prose.",
      retryNote,
      `Decision intake JSON: ${JSON.stringify(input)}`,
    ]
      .filter(Boolean)
      .join("\n"),
    schema: rawClarificationResponseSchema,
    temperature: pass === "retry" ? 0 : 0.1,
    maxTokens: 1000,
  });

  return normalizeClarificationQuestions(raw);
}

function fallbackBrief(input: CreateDecisionInput, qaPairs: QaPair[]): DecisionBrief {
  const title = input.title?.trim() || input.prompt.trim().slice(0, 80);
  const alternatives = [...splitBullets(input.alternatives)];
  const constraints = [...splitBullets(input.constraints)];
  const stakeholders = [...splitBullets(input.stakeholders)];
  const successCriteria = [...splitBullets(input.successCriteria)];

  for (const pair of qaPairs) {
    const question = pair.question.toLowerCase();

    if (question.includes("constraint")) {
      constraints.push(...splitBullets(pair.answer));
    }

    if (question.includes("stakeholder")) {
      stakeholders.push(...splitBullets(pair.answer));
    }

    if (question.includes("success")) {
      successCriteria.push(...splitBullets(pair.answer));
    }

    if (question.includes("option") || question.includes("alternative")) {
      alternatives.push(...splitBullets(pair.answer));
    }
  }

  const normalizedAlternatives = [...new Set(alternatives)].slice(0, 8);
  const normalizedConstraints = [...new Set(constraints)].slice(0, 20);
  const normalizedStakeholders = [...new Set(stakeholders)].slice(0, 20);
  const normalizedCriteria = [...new Set(successCriteria)].slice(0, 20);

  return {
    title,
    decisionStatement: input.prompt,
    context: `Decision context captured from intake prompt with ${qaPairs.length} clarification answers.`,
    alternatives:
      normalizedAlternatives.length > 0
        ? normalizedAlternatives
        : ["Conservative option", "Balanced option", "Aggressive option"],
    constraints: normalizedConstraints.length > 0 ? normalizedConstraints : ["No explicit constraints provided"],
    deadline: input.deadline?.trim() || null,
    stakeholders: normalizedStakeholders.length > 0 ? normalizedStakeholders : ["Primary decision owner"],
    successCriteria:
      normalizedCriteria.length > 0
        ? normalizedCriteria
        : ["Define measurable KPI targets before execution"],
    riskTolerance: deriveRiskTolerance(input, qaPairs),
    budget: input.budget?.trim() || null,
    timeLimit: input.timeLimit?.trim() || null,
    assumptions: [
      "Stakeholder goals can be aligned with transparent tradeoffs.",
      "Execution capacity will remain stable through the initial rollout.",
    ],
    openQuestions: [
      "Which option has the strongest downside protection?",
      "What early signal will indicate the decision is failing?",
    ],
    executionSteps: [
      "Confirm constraints, resources, and success metrics with stakeholders.",
      "Evaluate alternatives with framework outputs and select an execution path.",
      "Run a short pilot and review outcomes against success criteria.",
    ],
  };
}

export function scoreDecisionBriefQuality(brief: DecisionBrief): number {
  const checks = [
    brief.alternatives.length >= 2,
    brief.constraints.length > 0,
    brief.stakeholders.length > 0,
    brief.successCriteria.length > 0,
    Boolean(brief.deadline),
    Boolean(brief.budget),
    brief.executionSteps.length >= 3,
    brief.assumptions.length >= 2,
    brief.openQuestions.length >= 1,
  ];

  const score = checks.filter(Boolean).length / checks.length;
  return Number(score.toFixed(3));
}

export async function generateClarificationQuestions(
  input: CreateDecisionInput,
  preference: ProviderPreference = "auto",
): Promise<{ questions: ClarificationQuestion[]; provider: string; fallback: boolean; model: string }> {
  const primaryLLM = await resolveLLM(preference);
  try {
    const questions = await generateClarificationQuestionsWithProvider(input, primaryLLM);

    return {
      questions,
      provider: primaryLLM.provider,
      fallback: false,
      model: primaryLLM.model,
    };
  } catch (primaryError) {
    if (!isStructuredRecoveryError(primaryError)) {
      throw primaryError;
    }

    const alternateLLM = await resolveAlternateLLM(preference, primaryLLM.provider);
    if (alternateLLM) {
      try {
        const alternateQuestions = await generateClarificationQuestionsWithProvider(input, alternateLLM);
        return {
          questions: alternateQuestions,
          provider: alternateLLM.provider,
          fallback: false,
          model: alternateLLM.model,
        };
      } catch (alternateError) {
        if (!isStructuredRecoveryError(alternateError)) {
          throw alternateError;
        }
      }
    }

    const usedIds = new Set<string>();
    const recovered = fallbackQuestions(input)
      .map((question, index) => ({
        ...question,
        id: safeQuestionId(question.id, index + 1, usedIds),
      }))
      .slice(0, 6);

    return {
      questions: clarificationQuestionSchema.array().min(3).max(6).parse(recovered),
      provider: "heuristic_recovery",
      fallback: true,
      model: primaryLLM.model,
    };
  }
}

export async function generateDecisionBrief(
  input: CreateDecisionInput,
  qaPairs: QaPair[],
  preference: ProviderPreference = "auto",
): Promise<{ decisionBrief: DecisionBrief; provider: string; fallback: boolean; model: string }> {
  const primaryLLM = await resolveLLM(preference);

  const buildBrief = async (llm: ResolvedLLM) =>
    llm.adapter.generateJson({
      systemPrompt:
        "You are a senior strategy advisor. Convert raw decision context into a structured execution-ready brief.",
      userPrompt: [
        "Return a JSON object that follows the required schema.",
        "Do not use markdown.",
        "Include an alternatives array with at least 2 concrete options.",
        `Intake: ${JSON.stringify(input)}`,
        `Clarifications: ${JSON.stringify(qaPairs)}`,
      ].join("\n"),
      schema: decisionBriefSchema,
      temperature: 0.1,
      maxTokens: 1800,
    });

  try {
    const decisionBrief = await buildBrief(primaryLLM);
    return {
      decisionBrief,
      provider: primaryLLM.provider,
      fallback: false,
      model: primaryLLM.model,
    };
  } catch (primaryError) {
    if (!isStructuredRecoveryError(primaryError)) {
      throw primaryError;
    }

    const alternateLLM = await resolveAlternateLLM(preference, primaryLLM.provider);
    if (alternateLLM) {
      const decisionBrief = await buildBrief(alternateLLM);
      return {
        decisionBrief,
        provider: alternateLLM.provider,
        fallback: false,
        model: alternateLLM.model,
      };
    }

    throw primaryError;
  }
}

export async function suggestClarificationAnswers(
  input: CreateDecisionInput,
  questions: ClarificationQuestion[],
  preference: ProviderPreference = "auto",
): Promise<{ suggestions: ClarificationAnswer[]; provider: string; fallback: boolean; model: string }> {
  const primaryLLM = await resolveLLM(preference);

  const suggestWithProvider = async (llm: ResolvedLLM) =>
    llm.adapter.generateJson({
      systemPrompt:
        "You are a pragmatic decision advisor. Provide practical, forward-moving draft answers to clarification questions.",
      userPrompt: [
        "Return JSON array: [{id, answer}] with one answer per question id.",
        "Answers must be concise (1-2 sentences), actionable, and include assumptions when data is missing.",
        "Do not copy input fields verbatim; synthesize them into sensible guidance.",
        `Decision intake JSON: ${JSON.stringify(input)}`,
        `Questions: ${JSON.stringify(questions)}`,
      ].join("\n"),
      schema: clarificationAnswerSchema.array().min(questions.length).max(questions.length),
      temperature: 0.2,
      maxTokens: 1200,
    });

  try {
    const llmSuggestions = await suggestWithProvider(primaryLLM);

    return {
      suggestions: normalizeSuggestions(questions, llmSuggestions),
      provider: primaryLLM.provider,
      fallback: false,
      model: primaryLLM.model,
    };
  } catch (primaryError) {
    if (!isStructuredRecoveryError(primaryError)) {
      throw primaryError;
    }

    const alternateLLM = await resolveAlternateLLM(preference, primaryLLM.provider);
    if (alternateLLM) {
      try {
        const alternateSuggestions = await suggestWithProvider(alternateLLM);
        return {
          suggestions: normalizeSuggestions(questions, alternateSuggestions),
          provider: alternateLLM.provider,
          fallback: false,
          model: alternateLLM.model,
        };
      } catch (alternateError) {
        if (!isStructuredRecoveryError(alternateError)) {
          throw alternateError;
        }
      }
    }

    return {
      suggestions: fallbackSuggestions(input, questions),
      provider: "heuristic_recovery",
      fallback: true,
      model: primaryLLM.model,
    };
  }
}

export function generateClarificationQuestionsSimulation(
  input: CreateDecisionInput,
): { questions: ClarificationQuestion[]; provider: string; fallback: boolean } {
  return {
    questions: fallbackQuestions(input),
    provider: "heuristic",
    fallback: true,
  };
}

export function generateDecisionBriefSimulation(
  input: CreateDecisionInput,
  qaPairs: QaPair[],
): { decisionBrief: DecisionBrief; provider: string; fallback: boolean } {
  const brief = fallbackBrief(input, qaPairs);
  return {
    decisionBrief: decisionBriefSchema.parse(brief),
    provider: "heuristic",
    fallback: true,
  };
}

export function suggestClarificationAnswersSimulation(
  input: CreateDecisionInput,
  questions: ClarificationQuestion[],
): { suggestions: ClarificationAnswer[]; provider: string; fallback: boolean } {
  return {
    suggestions: fallbackSuggestions(input, questions),
    provider: "heuristic",
    fallback: true,
  };
}
