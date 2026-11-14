import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as typeof globalThis & {
  prisma?: PrismaClient;
};

function createClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required");

  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

export function getDb() {
  if (process.env.NODE_ENV === "development") {
    return (globalForPrisma.prisma ??= createClient());
  }

  return (prisma ??= createClient());
}

let prisma: PrismaClient | undefined;
