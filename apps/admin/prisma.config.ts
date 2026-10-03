import { config } from 'dotenv';
import { defineConfig } from 'prisma/config';

// Match Next.js local configuration without overriding injected deployment secrets.
config({ path: '.env.local', quiet: true });
config({ path: '.env', quiet: true });

export default defineConfig({ schema: 'prisma/schema.prisma', migrations: { path: 'prisma/migrations' }, datasource: { url: process.env.DIRECT_URL || process.env.DATABASE_URL || 'postgresql://unused:unused@localhost:5432/igo' } });
