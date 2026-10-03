import { config } from 'dotenv';
import { defineConfig } from 'prisma/config';
import { databaseUrl } from './src/lib/database-url';

// Match Next.js local configuration without overriding injected deployment secrets.
config({ path: '.env.local', quiet: true });
config({ path: '.env', quiet: true });

// Never silently send migrations through the transaction pooler.
if (process.argv.includes('migrate') && !process.env.DIRECT_URL) {
  throw new Error('Set DIRECT_URL in .env.local to your Supabase session pooler (5432) or direct connection before running migrations.');
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: {
    // Client generation/builds do not connect to a database.
    url: process.env.DIRECT_URL ? databaseUrl(process.env.DIRECT_URL, 'prisma') : 'postgresql://unused:unused@localhost:5432/igo',
  },
});
