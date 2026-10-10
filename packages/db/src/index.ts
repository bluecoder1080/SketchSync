import { PrismaClient } from "@prisma/client";

// Singleton: Next.js / Express hot-reload would otherwise open a new pool
// per reload and exhaust PostgreSQL connections.
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

function createClient(): PrismaClient {
  return new PrismaClient({
    log:
      process.env["NODE_ENV"] === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });
}

export const prisma: PrismaClient =
  globalForPrisma.prisma ?? createClient();

if (process.env["NODE_ENV"] !== "production") {
  globalForPrisma.prisma = prisma;
}

export async function disconnectDb(): Promise<void> {
  await prisma.$disconnect();
}
