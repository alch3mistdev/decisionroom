import { z } from "zod";

import {
  TOP_12_DEEP_FRAMEWORK_IDS,
  type FrameworkId,
  type Top12DeepFrameworkId,
  type Top12VisualizationData,
  type VisualizationSpec,
} from "@/lib/types";
import {
  scoreTop12Representation,
  type Top12RubricReport,
} from "@/lib/frameworks/representation-rubric";

const idSchema = z.string().min(1);
const numeric01 = z.number().min(0).max(1);

const eisenhowerDataSchema = z
  .object({
    kind: z.literal("eisenhower_matrix"),
    quadrants: z
      .array(
        z.object({
          id: z.enum(["do", "schedule", "delegate", "eliminate"]),
          label: z.string().min(1),
          count: z.number().int().min(0),
          items: z.array(z.string().min(1)),
        }),
      )
      .length(4),
    points: z.array(
      z.object({
        label: z.string().min(1),
        urgency: numeric01,
        importance: numeric01,
        quadrant: z.enum(["do", "schedule", "delegate", "eliminate"]),
      }),
    ),
  })
  .strict();

const swotDataSchema = z
  .object({
    kind: z.literal("swot_analysis"),
    strengths: z.array(z.string().min(1)).min(1),
    weaknesses: z.array(z.string().min(1)).min(1),
    opportunities: z.array(z.string().min(1)).min(1),
    threats: z.array(z.string().min(1)).min(1),
  })
  .strict();

const bcgDataSchema = z
  .object({
    kind: z.literal("bcg_matrix"),
    quadrants: z
      .object({
        topLeft: z.string().min(1),
        topRight: z.string().min(1),
        bottomLeft: z.string().min(1),
        bottomRight: z.string().min(1),
      })
      .strict(),
    points: z.array(
      z.object({
        id: idSchema,
        label: z.string().min(1),
        share: numeric01,
        growth: numeric01,
        size: z.number().positive(),
        quadrant: z.enum(["question_marks", "stars", "dogs", "cash_cows"]),
      }),
    ),
  })
  .strict();

const projectPortfolioDataSchema = z
  .object({
    kind: z.literal("project_portfolio_matrix"),
    quadrants: z
      .object({
        topLeft: z.string().min(1),
        topRight: z.string().min(1),
        bottomLeft: z.string().min(1),
        bottomRight: z.string().min(1),
      })
      .strict(),
    points: z.array(
      z.object({
        id: idSchema,
        label: z.string().min(1),
        risk: numeric01,
        value: numeric01,
        probability: numeric01,
        size: z.number().positive(),
        quadrant: z.string().min(1),
      }),
    ),
  })
  .strict();

const paretoDataSchema = z
  .object({
    kind: z.literal("pareto_principle"),
    factors: z
      .array(
        z.object({
          label: z.string().min(1),
          contribution: numeric01,
          cumulative: numeric01,
          detail: z.string().min(1).optional(),
        }),
      )
      .min(1),
    threshold: numeric01,
  })
  .strict();

const hypeDataSchema = z
  .object({
    kind: z.literal("hype_cycle"),
    phases: z
      .array(
        z.object({
          phase: z.string().min(1),
          x: numeric01,
          y: numeric01,
        }),
      )
      .min(5),
    current: z
      .object({
        label: z.string().min(1),
        x: numeric01,
        y: numeric01,
        phase: z.string().min(1),
      })
      .strict(),
  })
  .strict();

const chasmDataSchema = z
  .object({
    kind: z.literal("chasm_diffusion_model"),
    segments: z
      .array(
        z.object({
          segment: z.string().min(1),
          adoption: numeric01,
        }),
      )
      .min(5),
    chasmAfter: z.string().min(1),
    gap: numeric01,
  })
  .strict();

const monteCarloDataSchema = z
  .object({
    kind: z.literal("monte_carlo_simulation"),
    bins: z
      .array(
        z.object({
          binStart: numeric01,
          binEnd: numeric01,
          count: z.number().int().min(0),
        }),
      )
      .min(6),
    total: z.number().int().positive(),
    p10: numeric01,
    p50: numeric01,
    p90: numeric01,
    metadata: z
      .object({
        trials: z.number().int().positive(),
        distribution: z.string().min(1),
        correlationMode: z.string().min(1),
      })
      .optional(),
  })
  .strict();

const consequencesDataSchema = z
  .object({
    kind: z.literal("consequences_model"),
    horizons: z
      .array(
        z.object({
          horizon: z.string().min(1),
          direct: numeric01,
          indirect: numeric01,
          thirdOrder: numeric01.optional(),
          net: z.number().min(-1).max(1),
        }),
      )
      .min(4),
    links: z.array(
      z.object({
        from: z.string().min(1),
        to: z.string().min(1),
        weight: numeric01,
      }),
    ),
  })
  .strict();

const crossroadsDataSchema = z
  .object({
    kind: z.literal("crossroads_model"),
    options: z
      .array(
        z.object({
          option: z.string().min(1),
          feasibility: numeric01,
          desirability: numeric01,
          reversibility: numeric01,
          size: z.number().positive(),
          note: z.string().min(1),
        }),
      )
      .min(2),
  })
  .strict();

const conflictDataSchema = z
  .object({
    kind: z.literal("conflict_resolution_model"),
    modes: z
      .array(
        z.object({
          mode: z.string().min(1),
          assertiveness: numeric01,
          cooperativeness: numeric01,
          suitability: numeric01,
        }),
      )
      .length(5),
    recommendedMode: z.string().min(1),
  })
  .strict();

const doubleLoopDataSchema = z
  .object({
    kind: z.literal("double_loop_learning"),
    loops: z
      .array(
        z.object({
          behavior: z.string().min(1),
          outcome: z.string().min(1),
          singleLoopFix: z.string().min(1),
          rootAssumption: z.string().min(1),
          leverage: numeric01,
        }),
      )
      .min(1),
  })
  .strict();

export const TOP12_VIZ_TYPE_BY_FRAMEWORK: Record<Top12DeepFrameworkId, VisualizationSpec["type"]> = {
  eisenhower_matrix: "quadrant",
  swot_analysis: "swot",
  bcg_matrix: "scatter",
  project_portfolio_matrix: "scatter",
  pareto_principle: "bar",
  hype_cycle: "line",
  chasm_diffusion_model: "bar",
  monte_carlo_simulation: "histogram",
  consequences_model: "timeline",
  crossroads_model: "scatter",
  conflict_resolution_model: "scatter",
  double_loop_learning: "list",
};

const TOP12_DATA_SCHEMA_BY_FRAMEWORK: Record<Top12DeepFrameworkId, z.ZodType<unknown>> = {
  eisenhower_matrix: eisenhowerDataSchema,
  swot_analysis: swotDataSchema,
  bcg_matrix: bcgDataSchema,
  project_portfolio_matrix: projectPortfolioDataSchema,
  pareto_principle: paretoDataSchema,
  hype_cycle: hypeDataSchema,
  chasm_diffusion_model: chasmDataSchema,
  monte_carlo_simulation: monteCarloDataSchema,
  consequences_model: consequencesDataSchema,
  crossroads_model: crossroadsDataSchema,
  conflict_resolution_model: conflictDataSchema,
  double_loop_learning: doubleLoopDataSchema,
};

const top12Set = new Set<string>(TOP_12_DEEP_FRAMEWORK_IDS);

export function isTop12FrameworkId(frameworkId: FrameworkId): frameworkId is Top12DeepFrameworkId {
  return top12Set.has(frameworkId);
}

export function validateFrameworkViz(
  frameworkId: FrameworkId,
  vizPayload: VisualizationSpec,
): {
  ok: boolean;
  canonical: boolean;
  issues: string[];
  rubric?: Top12RubricReport;
} {
  if (!isTop12FrameworkId(frameworkId)) {
    return { ok: true, canonical: false, issues: [] };
  }

  const issues: string[] = [];
  const expectedType = TOP12_VIZ_TYPE_BY_FRAMEWORK[frameworkId];
  if (vizPayload.type !== expectedType) {
    issues.push(`Expected viz type "${expectedType}" for ${frameworkId}, received "${vizPayload.type}".`);
  }

  if (vizPayload.vizSchemaVersion !== 2) {
    issues.push(`Expected vizSchemaVersion=2 for ${frameworkId}.`);
  }

  const parsed = TOP12_DATA_SCHEMA_BY_FRAMEWORK[frameworkId].safeParse(vizPayload.data);
  let rubric: Top12RubricReport | undefined;
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      issues.push(issue.message);
    }
  } else {
    rubric = scoreTop12Representation(
      frameworkId,
      parsed.data as Top12VisualizationData,
    );

    for (const criterion of rubric.criteria) {
      if (!criterion.passed && criterion.issue) {
        issues.push(`[${criterion.id}] ${criterion.issue}`);
      }
    }

    if (!rubric.passed) {
      issues.push(
        `Rubric score ${Math.round(rubric.score * 100)}% is below threshold ${Math.round(
          rubric.passThreshold * 100,
        )}% for ${frameworkId}.`,
      );
    }
  }

  return {
    ok: issues.length === 0,
    canonical: true,
    issues,
    rubric,
  };
}
