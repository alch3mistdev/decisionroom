import { ZodError } from "zod";

import {
  getDecisionWithLatestBrief,
  replaceClarificationQuestions,
  saveClarificationAnswers,
  saveDecisionBrief,
} from "@/lib/decisions";
import { badRequest, handleRouteError, notFound, ok, parseBody } from "@/lib/http";
import {
  generateClarificationQuestions,
  generateDecisionBrief,
  scoreDecisionBriefQuality,
  suggestClarificationAnswers,
} from "@/lib/refinement";
import { createDecisionInputSchema, refineRequestSchema } from "@/lib/schemas";

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

    const rawInput = createDecisionInputSchema.parse(decision.rawInput);
    const payload = await parseBody(request, refineRequestSchema);

    if (payload.mode === "generate_questions") {
      const generated = await generateClarificationQuestions(rawInput, "auto");
      const persisted = await replaceClarificationQuestions(id, generated.questions);

      return ok({
        questions: persisted.questions,
        generationId: persisted.generationId,
        provider: generated.provider,
        model: generated.model,
        fallback: generated.fallback,
      });
    }

    if (payload.mode === "suggest_answers") {
      const normalizedQuestions = payload.questions.map((question) => ({
        id: question.id,
        question: question.question,
        rationale: question.rationale ?? "Clarification needed for decision quality.",
      }));

      const suggested = await suggestClarificationAnswers(rawInput, normalizedQuestions, "auto");

      return ok({
        suggestions: suggested.suggestions,
        provider: suggested.provider,
        model: suggested.model,
        fallback: suggested.fallback,
      });
    }

    const saved = await saveClarificationAnswers(id, payload.answers);
    if (saved.unmatchedIds.length > 0) {
      return badRequest(
        "Some answers did not match current clarification questions. Refresh questions and try again.",
        {
          unmatchedIds: saved.unmatchedIds,
          generationId: saved.generationId,
        },
        "INVALID_STATE",
      );
    }

    if (saved.qaPairs.length === 0) {
      return badRequest("No clarification answers matched generated questions", undefined, "INVALID_STATE");
    }

    const generated = await generateDecisionBrief(rawInput, saved.qaPairs, "auto");
    const qualityScore = scoreDecisionBriefQuality(generated.decisionBrief);
    await saveDecisionBrief(id, generated.decisionBrief, qualityScore);

    return ok({
      decisionBrief: generated.decisionBrief,
      qualityScore,
      provider: generated.provider,
      model: generated.model,
      fallback: generated.fallback,
      status: "brief_ready",
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return badRequest("Invalid refinement payload", error.flatten());
    }

    return handleRouteError(error, "Refinement failed");
  }
}
