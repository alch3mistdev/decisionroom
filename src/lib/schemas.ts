import { z } from "zod";

import { FRAMEWORK_IDS } from "@/lib/types";

export const frameworkIdSchema = z.enum(FRAMEWORK_IDS);

export const createDecisionInputSchema = z.object({
  title: z.string().trim().min(1).max(180).optional(),
  prompt: z.string().trim().min(10).max(8000),
  alternatives: z.string().trim().max(2000).optional(),
  constraints: z.string().trim().max(2000).optional(),
  deadline: z.string().trim().max(120).optional(),
  stakeholders: z.string().trim().max(2000).optional(),
  successCriteria: z.string().trim().max(2000).optional(),
  riskTolerance: z.enum(["low", "medium", "high"]).optional(),
  budget: z.string().trim().max(200).optional(),
  timeLimit: z.string().trim().max(200).optional(),
});

export const clarificationQuestionSchema = z.object({
  id: z.string().min(1),
  question: z.string().min(1),
  rationale: z.string().min(1),
});

export const clarificationQuestionInputSchema = z.object({
  id: z.string().min(1),
  question: z.string().min(1),
  rationale: z.string().optional(),
});

export const clarificationAnswerSchema = z.object({
  id: z.string().min(1),
  answer: z.string().trim().min(1).max(2000),
});

export const refineRequestSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("generate_questions"),
  }),
  z.object({
    mode: z.literal("submit_answers"),
    answers: z.array(clarificationAnswerSchema).min(1),
  }),
  z.object({
    mode: z.literal("suggest_answers"),
    questions: z.array(clarificationQuestionInputSchema).min(1).max(12),
  }),
]);

export const decisionBriefSchema = z.object({
  title: z.string().min(1).max(180),
  decisionStatement: z.string().min(10).max(5000),
  context: z.string().min(10).max(5000),
  alternatives: z.array(z.string().min(1).max(200)).max(12).default([]),
  constraints: z.array(z.string().min(1).max(400)).max(20),
  deadline: z.string().max(120).nullable(),
  stakeholders: z.array(z.string().min(1).max(200)).max(30),
  successCriteria: z.array(z.string().min(1).max(400)).max(20),
  riskTolerance: z.enum(["low", "medium", "high"]),
  budget: z.string().max(200).nullable(),
  timeLimit: z.string().max(200).nullable(),
  assumptions: z.array(z.string().min(1).max(400)).max(20),
  openQuestions: z.array(z.string().min(1).max(400)).max(20),
  executionSteps: z.array(z.string().min(1).max(400)).max(30),
});

export const analyzeRequestSchema = z.object({
  frameworkIds: z.array(frameworkIdSchema).min(1).max(FRAMEWORK_IDS.length).optional(),
  providerPreference: z.enum(["local", "hosted", "auto"]).default("auto"),
});

export const exportQuerySchema = z.object({
  format: z.enum(["md", "zip"]).default("md"),
});

export const visualizationSpecSchema = z.object({
  type: z.enum([
    "quadrant",
    "swot",
    "scatter",
    "line",
    "bar",
    "histogram",
    "timeline",
    "tree",
    "network",
    "radar",
    "list",
  ]),
  title: z.string().min(1),
  subtitle: z.string().optional(),
  xLabel: z.string().optional(),
  yLabel: z.string().optional(),
  vizSchemaVersion: z.number().int().min(1).optional(),
  data: z.unknown(),
});

export const themeVectorSchema = z.object({
  risk: z.number().min(0).max(1),
  urgency: z.number().min(0).max(1),
  opportunity: z.number().min(0).max(1),
  uncertainty: z.number().min(0).max(1),
  resources: z.number().min(0).max(1),
  stakeholderImpact: z.number().min(0).max(1),
});

export const frameworkAnalysisLLMSchema = z.object({
  applicabilityScore: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  insights: z.array(z.string().min(1).max(400)).min(3).max(8),
  actions: z.array(z.string().min(1).max(400)).min(3).max(8),
  risks: z.array(z.string().min(1).max(400)).min(2).max(8),
  assumptions: z.array(z.string().min(1).max(400)).min(2).max(8),
  themes: themeVectorSchema,
  vizPayload: visualizationSpecSchema,
});

export const frameworkResultSchema = z.object({
  frameworkId: frameworkIdSchema,
  frameworkName: z.string().min(1),
  applicabilityScore: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  insights: z.array(z.string()).min(1),
  actions: z.array(z.string()).min(1),
  risks: z.array(z.string()).min(1),
  assumptions: z.array(z.string()).min(1),
  themes: themeVectorSchema,
  vizPayload: visualizationSpecSchema,
  deepSupported: z.boolean(),
  generation: z
    .object({
      mode: z.enum(["llm", "fallback"]),
      provider: z.string().min(1).max(160).optional(),
      model: z.string().min(1).max(200).optional(),
      warning: z.string().min(1).max(800).optional(),
    })
    .optional(),
});

const decisionOptionScoreSchema = z.object({
  option: z.string().min(1).max(200),
  score: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  rationale: z.string().min(1).max(600),
});

const decisionRecommendationSchema = z.object({
  recommendedOption: z.string().min(1).max(200),
  confidence: z.number().min(0).max(1),
  rationale: z.string().min(1).max(800),
  tradeoffs: z.array(z.string().min(1).max(500)).max(20),
  nextActions: z.array(z.string().min(1).max(500)).max(20),
  optionScores: z.array(decisionOptionScoreSchema).min(1).max(20),
});

export const synthesisSummarySchema = z.object({
  topFrameworks: z
    .array(
      z.object({
        frameworkId: frameworkIdSchema,
        frameworkName: z.string().min(1).max(200),
        compositeScore: z.number().min(0).max(1),
        reason: z.string().min(1).max(600),
      }),
    )
    .max(12),
  contradictions: z
    .array(
      z.object({
        sourceFrameworkId: frameworkIdSchema,
        targetFrameworkId: frameworkIdSchema,
        reason: z.string().min(1).max(600),
      }),
    )
    .max(40),
  recommendedActions: z.array(z.string().min(1).max(500)).max(30),
  checkpoints: z.array(z.string().min(1).max(500)).max(30),
  decisionRecommendation: decisionRecommendationSchema.optional(),
  warnings: z.array(z.string().min(1).max(800)).max(100).optional(),
});

export function parseDelimited(value?: string): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}
