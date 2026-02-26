import { getRunStatusSnapshot } from "@/lib/analysis/runner";
import { notFound, ok, serverError } from "@/lib/http";

interface RouteContext {
  params: Promise<{ runId: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { runId } = await context.params;
    const snapshot = await getRunStatusSnapshot(runId);

    if (!snapshot) {
      return notFound(`Run ${runId} not found`);
    }

    return ok(snapshot);
  } catch (error) {
    return serverError(error instanceof Error ? error.message : "Failed to fetch run status");
  }
}
