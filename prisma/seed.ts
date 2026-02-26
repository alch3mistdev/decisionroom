import { PrismaClient } from "@prisma/client";

import { listFrameworkDefinitions } from "../src/lib/frameworks/registry";

const prisma = new PrismaClient();

async function main() {
  const definitions = listFrameworkDefinitions();

  for (const definition of definitions) {
    await prisma.frameworkDefinition.upsert({
      where: {
        id: definition.id,
      },
      update: {
        name: definition.name,
        category: definition.category,
        maturity: definition.maturity,
        deepSupported: definition.deepSupported,
        description: definition.description,
      },
      create: {
        id: definition.id,
        name: definition.name,
        category: definition.category,
        maturity: definition.maturity,
        deepSupported: definition.deepSupported,
        description: definition.description,
      },
    });
  }

  console.log(`Seeded ${definitions.length} framework definitions.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
