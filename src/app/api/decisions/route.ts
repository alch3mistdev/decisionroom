import { ZodError } from "zod";

import { createDecision } from "@/lib/decisions";
import { created, badRequest, serverError, parseBody } from "@/lib/http";
import { createDecisionInputSchema } from "@/lib/schemas";

export async function POST(request: Request) {
  try {
    const input = await parseBody(request, createDecisionInputSchema);
    const decision = await createDecision(input);

    return created({
      decisionId: decision.id,
      status: "created",
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return badRequest("Invalid decision payload", error.flatten());
    }

    return serverError(error instanceof Error ? error.message : "Failed to create decision");
  }
}
