import { ZodError } from "zod";

import { enqueueAnalysisRun } from "@/lib/analysis/runner";
import { getDecisionWithLatestBrief } from "@/lib/decisions";
import { prisma } from "@/lib/db";
import { listFrameworkDefinitions } from "@/lib/frameworks/registry";
import { badRequest, handleRouteError, notFound, ok, parseBody } from "@/lib/http";
import { resolveLLM } from "@/lib/llm/router";
import { analyzeRequestSchema } from "@/lib/schemas";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const decision = await getDecisionWithLatestBrief(id);

    if (!decision) {
      return notFound(`Decision ${id} not found`);
    }

    if (!decision.briefs[0]) {
      return badRequest("Decision brief missing. Run refinement first.");
    }

    const payload = await parseBody(request, analyzeRequestSchema);
    const frameworks = payload.frameworkIds ?? listFrameworkDefinitions().map((framework) => framework.id);
    const resolved = await resolveLLM(payload.providerPreference);

    const run = await prisma.analysisRun.create({
      data: {
        decisionId: id,
        provider: resolved.provider,
        model: resolved.model,
        status: "queued",
        frameworkIds: frameworks,
      },
    });

    await enqueueAnalysisRun(run.id);

    return ok({
      runId: run.id,
      status: "queued",
      provider: run.provider,
      model: run.model,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return badRequest("Invalid analysis payload", error.flatten());
    }

    return handleRouteError(error, "Failed to start analysis");
  }
}
