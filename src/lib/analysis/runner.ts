import type { Prisma } from "@prisma/client";

import { buildPropagatedDecisionMap, buildSynthesisSummary } from "@/lib/analysis/propagation";
import { inferDecisionThemeVector } from "@/lib/analysis/theme";
import { prisma } from "@/lib/db";
import { analyzeFrameworkWithLLM } from "@/lib/frameworks/analyzers";
import { listFrameworkDefinitions } from "@/lib/frameworks/registry";
import { resolveLLM } from "@/lib/llm/router";
import { decisionBriefSchema } from "@/lib/schemas";
import type { FrameworkId, ProviderPreference, RunStatus } from "@/lib/types";

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

  const resolvedLLM = await resolveLLM(providerToPreference(run.provider));
  await prisma.analysisRun.update({
    where: { id: runId },
    data: {
      provider: resolvedLLM.provider,
      model: resolvedLLM.model,
    },
  });

  const decisionThemes = inferDecisionThemeVector(brief);
  const frameworkResults = [];

  for (const frameworkId of selectedFrameworkIds) {
    const result = await analyzeFrameworkWithLLM(frameworkId, brief, decisionThemes, {
      adapter: resolvedLLM.adapter,
      provider: resolvedLLM.provider,
      model: resolvedLLM.model,
    });
    frameworkResults.push(result);

    await prisma.frameworkResultRecord.upsert({
      where: {
        runId_frameworkId: {
          runId,
          frameworkId,
        },
      },
      update: {
        resultJson: result as unknown as Prisma.InputJsonValue,
        applicabilityScore: result.applicabilityScore,
        confidence: result.confidence,
      },
      create: {
        runId,
        frameworkId,
        resultJson: result as unknown as Prisma.InputJsonValue,
        applicabilityScore: result.applicabilityScore,
        confidence: result.confidence,
      },
    });
  }

  await markRun(runId, "synthesizing");
  const propagatedMap = buildPropagatedDecisionMap(frameworkResults);
  const synthesis = buildSynthesisSummary(brief, frameworkResults, propagatedMap);

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
