import { ZodError } from "zod";

import {
  getDecisionWithLatestBrief,
  getLatestClarificationGeneration,
  getLatestRunSnapshot,
} from "@/lib/decisions";
import { badRequest, handleRouteError, notFound, ok } from "@/lib/http";
import { createDecisionInputSchema, decisionBriefSchema } from "@/lib/schemas";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const decision = await getDecisionWithLatestBrief(id);

    if (!decision) {
      return notFound(`Decision ${id} not found`);
    }

    const input = createDecisionInputSchema.parse(decision.rawInput);
    const latestBriefRecord = decision.briefs[0] ?? null;
    const clarifications = await getLatestClarificationGeneration(id);
    const latestRun = await getLatestRunSnapshot(id);

    return ok({
      decision: {
        id: decision.id,
        title: decision.title,
        createdAt: decision.createdAt.toISOString(),
        updatedAt: decision.updatedAt.toISOString(),
        input,
      },
      brief: latestBriefRecord ? decisionBriefSchema.parse(latestBriefRecord.briefJson) : null,
      briefQualityScore: latestBriefRecord?.qualityScore ?? null,
      clarifications,
      latestRun,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return badRequest("Stored decision data failed validation", error.flatten());
    }

    return handleRouteError(error, "Failed to fetch decision context");
  }
}
