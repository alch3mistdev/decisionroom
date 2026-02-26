import type { Prisma } from "@prisma/client";

import { buildPropagatedDecisionMap, buildSynthesisSummary } from "@/lib/analysis/propagation";
import { inferDecisionThemeVector } from "@/lib/analysis/theme";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import {
  ModelOutputInvalidError,
  ModelTimeoutError,
  ProviderUnavailableError,
} from "@/lib/errors";
import {
  analyzeFrameworkSimulation,
  analyzeFrameworkWithLLM,
  type LLMFrameworkAnalysisContext,
} from "@/lib/frameworks/analyzers";
import { getFrameworkDefinition, listFrameworkDefinitions } from "@/lib/frameworks/registry";
import {
  getAdapterForResolvedProvider,
  resolveLLM,
  type ResolvedLLM,
} from "@/lib/llm/router";
import { decisionBriefSchema } from "@/lib/schemas";
import type {
  DecisionBrief,
  FrameworkId,
  FrameworkResult,
  ProviderPreference,
  ResolvedProvider,
  RunStatus,
  ThemeVector,
} from "@/lib/types";

const runPromises = new Map<string, Promise<void>>();

function parseFrameworkIds(rawFrameworkIds: Prisma.JsonValue): FrameworkId[] {
  if (!Array.isArray(rawFrameworkIds)) {
    return [];
  }

  return rawFrameworkIds as FrameworkId[];
}

async function ensureFrameworkDefinitionsSeeded(): Promise<void> {
  const frameworks = listFrameworkDefinitions();

  await prisma.$transaction(
    frameworks.map((framework) =>
      prisma.frameworkDefinition.upsert({
        where: { id: framework.id },
        update: {
          name: framework.name,
          category: framework.category,
          maturity: framework.maturity,
          deepSupported: framework.deepSupported,
          description: framework.description,
        },
        create: {
          id: framework.id,
          name: framework.name,
          category: framework.category,
          maturity: framework.maturity,
          deepSupported: framework.deepSupported,
          description: framework.description,
        },
      }),
    ),
  );
}

async function markRun(runId: string, status: RunStatus, error?: string): Promise<void> {
  await prisma.analysisRun.update({
    where: { id: runId },
    data: {
      status,
      error: error ?? null,
      ...(status === "analyzing" ? { startedAt: new Date() } : {}),
      ...(status === "complete" || status === "failed" ? { endedAt: new Date() } : {}),
    },
  });
}

function providerToPreference(provider: string): ProviderPreference {
  if (provider === "local" || provider === "hosted") {
    return provider;
  }

  return "auto";
}

function isResolvedProvider(provider: string): provider is ResolvedProvider {
  return provider === "local" || provider === "hosted";
}

async function resolveRunLLM(provider: string): Promise<ResolvedLLM> {
  if (isResolvedProvider(provider)) {
    return getAdapterForResolvedProvider(provider);
  }

  return resolveLLM(providerToPreference(provider));
}

function shouldUseLLMForFramework(frameworkId: FrameworkId): boolean {
  if (env.ANALYSIS_LLM_SCOPE === "all") {
    return true;
  }

  return getFrameworkDefinition(frameworkId).deepSupported;
}

function canFallbackToSimulation(error: unknown): boolean {
  return (
    error instanceof ProviderUnavailableError ||
    error instanceof ModelOutputInvalidError ||
    error instanceof ModelTimeoutError
  );
}

function alternateProviderPreference(provider: string): ProviderPreference | null {
  if (provider === "local") {
    return "hosted";
  }
  if (provider === "hosted") {
    return "local";
  }
  return null;
}

async function analyzeFrameworkForRun(
  frameworkId: FrameworkId,
  brief: DecisionBrief,
  decisionThemes: ThemeVector,
  llm: LLMFrameworkAnalysisContext,
): Promise<{ result: FrameworkResult; warning?: string }> {
  if (!shouldUseLLMForFramework(frameworkId)) {
    return {
      result: analyzeFrameworkSimulation(frameworkId, brief, decisionThemes),
    };
  }

  try {
    const result = await analyzeFrameworkWithLLM(frameworkId, brief, decisionThemes, llm);
    return { result };
  } catch (error) {
    if (!canFallbackToSimulation(error)) {
      throw error;
    }

    const framework = getFrameworkDefinition(frameworkId);
    const primaryReason = error instanceof Error ? error.message : "Unknown LLM failure";
    const alternatePreference = alternateProviderPreference(llm.provider);
    let alternateReason: string | null = null;

    if (alternatePreference) {
      try {
        const alternate = await resolveLLM(alternatePreference);
        if (alternate.provider !== llm.provider) {
          const alternateResult = await analyzeFrameworkWithLLM(frameworkId, brief, decisionThemes, {
            adapter: alternate.adapter,
            provider: alternate.provider,
            model: alternate.model,
          });

          const warning = `${framework.name} (${framework.id}) recovered on ${alternate.provider} after ${llm.provider} failure: ${primaryReason}`;
          return {
            result: {
              ...alternateResult,
              generation: {
                mode: "llm",
                provider: alternate.provider,
                model: alternate.model,
                warning,
              },
            },
            warning,
          };
        }
      } catch (failoverError) {
        alternateReason =
          failoverError instanceof Error ? failoverError.message : "Unknown failover error";
      }
    }

    const warning = alternateReason
      ? `${framework.name} (${framework.id}) fell back to deterministic analysis after ${llm.provider} failure (${primaryReason}) and failover failure (${alternateReason}).`
      : `${framework.name} (${framework.id}) fell back to deterministic analysis: ${primaryReason}`;
    const fallbackResult = analyzeFrameworkSimulation(frameworkId, brief, decisionThemes, {
      provider: llm.provider,
      model: llm.model,
      warning,
    });

    return {
      result: fallbackResult,
      warning,
    };
  }
}

async function processRun(runId: string): Promise<void> {
  await ensureFrameworkDefinitionsSeeded();
  await markRun(runId, "analyzing");

  const run = await prisma.analysisRun.findUnique({
    where: { id: runId },
    include: {
      decision: {
        include: {
          briefs: {
            orderBy: { version: "desc" },
            take: 1,
          },
        },
      },
    },
  });

  if (!run) {
    throw new Error(`Analysis run ${runId} not found`);
  }

  const latestBriefRecord = run.decision.briefs[0];
  if (!latestBriefRecord) {
    throw new Error("Decision brief not found. Run refinement first.");
  }

  const brief = decisionBriefSchema.parse(latestBriefRecord.briefJson);
  const selectedFrameworkIds = parseFrameworkIds(run.frameworkIds);

  if (selectedFrameworkIds.length === 0) {
    throw new Error("No frameworks requested for analysis run.");
  }

  const resolvedLLM = await resolveRunLLM(run.provider);
  await prisma.analysisRun.update({
    where: { id: runId },
    data: {
      provider: resolvedLLM.provider,
      model: resolvedLLM.model,
    },
  });

  const decisionThemes = inferDecisionThemeVector(brief);
  const frameworkResults = new Array<FrameworkResult | undefined>(selectedFrameworkIds.length);
  const warnings: string[] = [];
  const maxConcurrency = Math.max(
    1,
    Math.min(env.ANALYSIS_MAX_CONCURRENCY, selectedFrameworkIds.length),
  );
  let nextIndex = 0;

  await Promise.all(
    Array.from({ length: maxConcurrency }, async () => {
      while (true) {
        const index = nextIndex;
        nextIndex += 1;
        if (index >= selectedFrameworkIds.length) {
          return;
        }

        const frameworkId = selectedFrameworkIds[index];
        const analyzed = await analyzeFrameworkForRun(frameworkId, brief, decisionThemes, {
          adapter: resolvedLLM.adapter,
          provider: resolvedLLM.provider,
          model: resolvedLLM.model,
        });

        frameworkResults[index] = analyzed.result;
        if (analyzed.warning) {
          warnings.push(analyzed.warning);
        }

        await prisma.frameworkResultRecord.upsert({
          where: {
            runId_frameworkId: {
              runId,
              frameworkId,
            },
          },
          update: {
            resultJson: analyzed.result as unknown as Prisma.InputJsonValue,
            applicabilityScore: analyzed.result.applicabilityScore,
            confidence: analyzed.result.confidence,
          },
          create: {
            runId,
            frameworkId,
            resultJson: analyzed.result as unknown as Prisma.InputJsonValue,
            applicabilityScore: analyzed.result.applicabilityScore,
            confidence: analyzed.result.confidence,
          },
        });
      }
    }),
  );

  if (frameworkResults.some((result) => !result)) {
    throw new Error("Analysis run completed with missing framework results.");
  }

  const completedFrameworkResults = frameworkResults as FrameworkResult[];

  await markRun(runId, "synthesizing");
  const propagatedMap = buildPropagatedDecisionMap(completedFrameworkResults);
  const synthesis = buildSynthesisSummary(
    brief,
    completedFrameworkResults,
    propagatedMap,
    warnings,
  );

  await prisma.$transaction(async (transaction) => {
    await transaction.mapEdgeRecord.deleteMany({ where: { runId } });

    if (propagatedMap.edges.length > 0) {
      await transaction.mapEdgeRecord.createMany({
        data: propagatedMap.edges.map((edge) => ({
          runId,
          sourceFrameworkId: edge.source,
          targetFrameworkId: edge.target,
          relationType: edge.relationType,
          weight: edge.weight,
          rationale: edge.rationale,
        })),
      });
    }

    await transaction.analysisRun.update({
      where: { id: runId },
      data: {
        propagatedMap: propagatedMap as unknown as Prisma.InputJsonValue,
        synthesis: synthesis as unknown as Prisma.InputJsonValue,
        status: "complete",
        endedAt: new Date(),
        error: null,
      },
    });
  });
}

export async function enqueueAnalysisRun(runId: string): Promise<void> {
  if (runPromises.has(runId)) {
    return;
  }

  const promise = processRun(runId)
    .catch(async (error) => {
      await markRun(
        runId,
        "failed",
        error instanceof Error ? error.message : "Unknown analysis failure",
      );
    })
    .finally(() => {
      runPromises.delete(runId);
    });

  runPromises.set(runId, promise);
  void promise;
}

export async function getRunStatusSnapshot(runId: string) {
  const run = await prisma.analysisRun.findUnique({
    where: { id: runId },
    include: {
      frameworkResults: {
        select: { id: true },
      },
    },
  });

  if (!run) {
    return null;
  }

  const frameworkIds = parseFrameworkIds(run.frameworkIds);

  return {
    runId: run.id,
    decisionId: run.decisionId,
    provider: run.provider,
    model: run.model ?? null,
    status: run.status,
    error: run.error,
    startedAt: run.startedAt?.toISOString() ?? null,
    endedAt: run.endedAt?.toISOString() ?? null,
    frameworkCount: frameworkIds.length,
    completedFrameworkCount: run.frameworkResults.length,
  };
}
