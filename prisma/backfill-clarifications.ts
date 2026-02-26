import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const decisions = await prisma.decision.findMany({
    select: { id: true },
  });

  for (const decision of decisions) {
    const records = await prisma.clarificationQuestionRecord.findMany({
      where: { decisionId: decision.id },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });

    if (records.length === 0) {
      continue;
    }

    for (let index = 0; index < records.length; index += 1) {
      const record = records[index];
      await prisma.clarificationQuestionRecord.update({
        where: { id: record.id },
        data: {
          generationId: record.generationId ?? `legacy:${decision.id}`,
          sequence: record.sequence ?? index + 1,
          questionKey: record.questionKey ?? `legacy_q_${index + 1}`,
        },
      });
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
