import crypto from "node:crypto";

import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import type {
  ClarificationAnswer,
  ClarificationGenerationSnapshot,
  ClarificationQuestion,
  CreateDecisionInput,
  DecisionBrief,
  DecisionRunStatus,
} from "@/lib/types";

interface ClarificationRecordShape {
  id: string;
  question: string;
  questionKey: string | null;
  generationId: string | null;
  sequence: number | null;
  answer: string | null;
  status: string;
}

interface SaveClarificationAnswersResult {
  qaPairs: Array<{ question: string; answer: string }>;
  unmatchedIds: string[];
  generationId: string;
}

function normalizeQuestionKey(value: string, sequence: number, used: Set<string>): string {
  const sanitized = value
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "_")
    .replaceAll(/^_+|_+$/g, "");
  const base = sanitized.length > 0 ? sanitized : `q_${sequence}`;

  let candidate = base;
  let index = 2;
  while (used.has(candidate)) {
    candidate = `${base}_${index}`;
    index += 1;
  }
  used.add(candidate);

  return candidate;
}

export function pairClarificationAnswers(
  questions: ClarificationRecordShape[],
  answers: ClarificationAnswer[],
): {
  paired: Array<{ id: string; question: string; answer: string }>;
  unmatchedIds: string[];
} {
  const questionByKey = new Map(
    questions.map((question) => [question.questionKey ?? "", question] as const),
  );
  const paired: Array<{ id: string; question: string; answer: string }> = [];
  const unmatchedIds: string[] = [];

  for (const answer of answers) {
    const question = questionByKey.get(answer.id);
    if (!question) {
      unmatchedIds.push(answer.id);
      continue;
    }

    paired.push({
      id: question.id,
      question: question.question,
      answer: answer.answer,
    });
  }

  return {
    paired,
    unmatchedIds,
  };
}

async function ensureLegacyClarificationsBackfilled(decisionId: string): Promise<void> {
  const records = await prisma.clarificationQuestionRecord.findMany({
    where: {
      decisionId,
      OR: [{ questionKey: null }, { generationId: null }, { sequence: null }],
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  if (records.length === 0) {
    return;
  }

  const usedByGeneration = new Map<string, Set<string>>();
  const sequenceByGeneration = new Map<string, number>();

  for (const record of records) {
    const generationId = record.generationId ?? `legacy:${decisionId}`;
    if (!usedByGeneration.has(generationId)) {
      usedByGeneration.set(generationId, new Set<string>());
    }
    if (record.questionKey) {
      usedByGeneration.get(generationId)?.add(record.questionKey);
    }
    if (record.sequence) {
      sequenceByGeneration.set(
        generationId,
        Math.max(sequenceByGeneration.get(generationId) ?? 0, record.sequence),
      );
    }
  }

  await prisma.$transaction(
    records.map((record) => {
      const generationId = record.generationId ?? `legacy:${decisionId}`;
      const used = usedByGeneration.get(generationId) ?? new Set<string>();
      const fallbackSequence = (sequenceByGeneration.get(generationId) ?? 0) + 1;
      const sequence = record.sequence ?? fallbackSequence;
      sequenceByGeneration.set(generationId, sequence);
      const questionKey =
        record.questionKey ??
        normalizeQuestionKey(record.question, sequence, used);

      return prisma.clarificationQuestionRecord.update({
        where: { id: record.id },
        data: {
          generationId,
          sequence,
          questionKey,
        },
      });
    }),
  );
}

export async function createDecision(input: CreateDecisionInput) {
  const title = input.title?.trim() || input.prompt.trim().slice(0, 120);

  return prisma.decision.create({
    data: {
      title,
      rawInput: input as unknown as Prisma.InputJsonValue,
    },
  });
}

export async function getDecisionWithLatestBrief(decisionId: string) {
  return prisma.decision.findUnique({
    where: { id: decisionId },
    include: {
      briefs: {
        orderBy: { version: "desc" },
        take: 1,
      },
    },
  });
}

export async function getLatestRunSnapshot(
  decisionId: string,
): Promise<DecisionRunStatus | null> {
  const run = await prisma.analysisRun.findFirst({
    where: { decisionId },
    include: {
      frameworkResults: {
        select: { id: true },
      },
    },
    orderBy: [{ createdAt: "desc" }],
  });

  if (!run) {
    return null;
  }

  const frameworkIds = Array.isArray(run.frameworkIds) ? run.frameworkIds : [];

  return {
    runId: run.id,
    decisionId: run.decisionId,
    provider: run.provider,
    model: run.model ?? null,
    status: run.status as DecisionRunStatus["status"],
    error: run.error,
    startedAt: run.startedAt?.toISOString() ?? null,
    endedAt: run.endedAt?.toISOString() ?? null,
    frameworkCount: frameworkIds.length,
    completedFrameworkCount: run.frameworkResults.length,
  };
}

export async function getLatestClarificationGeneration(
  decisionId: string,
): Promise<ClarificationGenerationSnapshot | null> {
  await ensureLegacyClarificationsBackfilled(decisionId);

  const latest = await prisma.clarificationQuestionRecord.findFirst({
    where: {
      decisionId,
      status: {
        in: ["pending", "answered"],
      },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });

  if (!latest?.generationId) {
    return null;
  }

  const rows = await prisma.clarificationQuestionRecord.findMany({
    where: {
      decisionId,
      generationId: latest.generationId,
      status: {
        in: ["pending", "answered"],
      },
    },
    orderBy: [{ sequence: "asc" }, { createdAt: "asc" }, { id: "asc" }],
  });

  return {
    generationId: latest.generationId,
    questions: rows.map((row, index) => ({
      id: row.questionKey ?? `legacy_q_${index + 1}`,
      question: row.question,
      rationale: row.rationale ?? "Clarification needed for decision quality.",
      answer: row.answer ?? null,
      status: row.status,
      sequence: row.sequence ?? index + 1,
    })),
  };
}

export async function replaceClarificationQuestions(
  decisionId: string,
  questions: ClarificationQuestion[],
  runId?: string,
): Promise<{ generationId: string; questions: ClarificationQuestion[] }> {
  await ensureLegacyClarificationsBackfilled(decisionId);
  const generationId = `gen:${crypto.randomUUID()}`;

  if (questions.length === 0) {
    return {
      generationId,
      questions: [],
    };
  }

  const usedKeys = new Set<string>();
  const normalized = questions.map((question, index) => ({
    question,
    questionKey: normalizeQuestionKey(question.id, index + 1, usedKeys),
    sequence: index + 1,
  }));

  await prisma.$transaction(async (transaction) => {
    await transaction.clarificationQuestionRecord.updateMany({
      where: {
        decisionId,
        status: {
          in: ["pending", "answered"],
        },
      },
      data: {
        status: "superseded",
      },
    });

    await transaction.clarificationQuestionRecord.createMany({
      data: normalized.map((item) => ({
        decisionId,
        runId,
        questionKey: item.questionKey,
        generationId,
        sequence: item.sequence,
        question: item.question.question,
        rationale: item.question.rationale,
        answer: null,
        status: "pending",
      })),
    });
  });

  return {
    generationId,
    questions: normalized.map((item) => ({
      id: item.questionKey,
      question: item.question.question,
      rationale: item.question.rationale,
      generationId,
      sequence: item.sequence,
    })),
  };
}

export async function getPendingClarifications(decisionId: string) {
  await ensureLegacyClarificationsBackfilled(decisionId);
  const generation = await getLatestClarificationGeneration(decisionId);
  if (!generation) {
    return [];
  }

  return prisma.clarificationQuestionRecord.findMany({
    where: {
      decisionId,
      generationId: generation.generationId,
      status: {
        in: ["pending", "answered"],
      },
    },
    orderBy: [{ sequence: "asc" }, { createdAt: "asc" }, { id: "asc" }],
  });
}

export async function saveClarificationAnswers(
  decisionId: string,
  answers: ClarificationAnswer[],
): Promise<SaveClarificationAnswersResult> {
  await ensureLegacyClarificationsBackfilled(decisionId);
  const questions =
    (await getPendingClarifications(decisionId)) as unknown as ClarificationRecordShape[];

  if (questions.length === 0) {
    throw new AppError({
      code: "INVALID_STATE",
      status: 400,
      message: "No active clarification questions found for this decision",
    });
  }

  const generationId = questions[0].generationId ?? `legacy:${decisionId}`;
  const { paired, unmatchedIds } = pairClarificationAnswers(questions, answers);

  if (unmatchedIds.length > 0) {
    return {
      qaPairs: [],
      unmatchedIds,
      generationId,
    };
  }

  await prisma.$transaction(
    paired.map((item) =>
      prisma.clarificationQuestionRecord.update({
        where: { id: item.id },
        data: {
          answer: item.answer,
          status: "answered",
        },
      }),
    ),
  );

  return {
    qaPairs: paired.map((item) => ({
      question: item.question,
      answer: item.answer,
    })),
    unmatchedIds: [],
    generationId,
  };
}

export async function saveDecisionBrief(
  decisionId: string,
  brief: DecisionBrief,
  qualityScore: number,
) {
  const latest = await prisma.decisionBriefRecord.findFirst({
    where: { decisionId },
    orderBy: { version: "desc" },
  });

  return prisma.decisionBriefRecord.create({
    data: {
      decisionId,
      version: (latest?.version ?? 0) + 1,
      briefJson: brief as unknown as Prisma.InputJsonValue,
      qualityScore,
    },
  });
}

export async function getLatestCompleteRun(decisionId: string) {
  return prisma.analysisRun.findFirst({
    where: {
      decisionId,
      status: "complete",
    },
    include: {
      frameworkResults: {
        orderBy: {
          applicabilityScore: "desc",
        },
      },
      mapEdges: true,
      exportArtifacts: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}
