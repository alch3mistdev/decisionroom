import { PrismaClient } from "@prisma/client";

declare global {
  var __decisionroomPrisma: PrismaClient | undefined;
}

export const prisma =
  global.__decisionroomPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  global.__decisionroomPrisma = prisma;
}
