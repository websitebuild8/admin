import 'server-only';
import { PrismaClient } from '@/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { databaseUrl } from './database-url';
const globalForPrisma = globalThis as unknown as { igoPrisma?: PrismaClient };
export function database() {
  if (!process.env.DATABASE_URL) throw new Error('Database is not configured.');
  if (!globalForPrisma.igoPrisma) globalForPrisma.igoPrisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl(process.env.DATABASE_URL), max: 5 }) });
  return globalForPrisma.igoPrisma;
}
