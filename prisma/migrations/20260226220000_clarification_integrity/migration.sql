-- Clarification integrity fields
ALTER TABLE "ClarificationQuestionRecord" ADD COLUMN "questionKey" TEXT;
ALTER TABLE "ClarificationQuestionRecord" ADD COLUMN "generationId" TEXT;
ALTER TABLE "ClarificationQuestionRecord" ADD COLUMN "sequence" INTEGER;

-- Analysis run provider model metadata
ALTER TABLE "AnalysisRun" ADD COLUMN "model" TEXT;

-- Backfill legacy clarification records deterministically by decision + creation order
UPDATE "ClarificationQuestionRecord"
SET "generationId" = 'legacy:' || "decisionId"
WHERE "generationId" IS NULL;

UPDATE "ClarificationQuestionRecord" AS target
SET "sequence" = (
  SELECT COUNT(*)
  FROM "ClarificationQuestionRecord" AS source
  WHERE source."decisionId" = target."decisionId"
    AND source."generationId" = target."generationId"
    AND (
      source."createdAt" < target."createdAt"
      OR (source."createdAt" = target."createdAt" AND source."id" <= target."id")
    )
)
WHERE target."sequence" IS NULL;

UPDATE "ClarificationQuestionRecord"
SET "questionKey" = 'legacy_q_' || COALESCE("sequence", 0)
WHERE "questionKey" IS NULL;

CREATE INDEX "ClarificationQuestionRecord_decisionId_generationId_sequence_idx"
ON "ClarificationQuestionRecord"("decisionId", "generationId", "sequence");

CREATE INDEX "ClarificationQuestionRecord_decisionId_generationId_questionKey_idx"
ON "ClarificationQuestionRecord"("decisionId", "generationId", "questionKey");
