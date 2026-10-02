import 'server-only';
import { PrismaClient } from '@/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
const globalForPrisma = globalThis as unknown as { igoPrisma?: PrismaClient };
export function database() {
  if (!process.env.DATABASE_URL) throw new Error('Database is not configured.');
  if (!globalForPrisma.igoPrisma) globalForPrisma.igoPrisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 5 }) });
  return globalForPrisma.igoPrisma;
}
