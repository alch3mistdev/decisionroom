import { ZodError } from "zod";

import { getDecisionWithLatestBrief, getLatestCompleteRun } from "@/lib/decisions";
import { badRequest, handleRouteError, notFound, ok } from "@/lib/http";
import { decisionBriefSchema, frameworkResultSchema } from "@/lib/schemas";

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

    const briefRecord = decision.briefs[0];
    if (!briefRecord) {
      return badRequest("Decision brief not found. Run refinement first.");
    }

    const run = await getLatestCompleteRun(id);
    if (!run) {
      return badRequest("No completed analysis run found for this decision.");
    }

    const brief = decisionBriefSchema.parse(briefRecord.briefJson);
    const frameworkResults = run.frameworkResults.map((record) => frameworkResultSchema.parse(record.resultJson));

    return ok({
      brief,
      frameworkResults,
      propagatedMap: run.propagatedMap,
      synthesis: run.synthesis,
      runId: run.id,
      provider: run.provider,
      model: run.model,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return badRequest("Stored results failed validation", error.flatten());
    }

    return handleRouteError(error, "Failed to fetch decision results");
  }
}
