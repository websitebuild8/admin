import { resolve } from 'node:path';

/** Server/CLI only. The bundled public CA verifies Supabase's database identity. */
export function databaseUrl(value: string, driver: 'pg' | 'prisma' = 'pg') {
  const url = new URL(value);
  if (url.hostname.endsWith('.supabase.com') || url.hostname.endsWith('.supabase.co')) {
    const certificate = resolve(process.cwd(), 'certs/supabase-root.crt');
    url.searchParams.delete('sslcert');
    url.searchParams.delete('sslrootcert');
    url.searchParams.delete('uselibpqcompat');
    url.searchParams.set(driver === 'pg' ? 'sslrootcert' : 'sslcert', certificate);
    url.searchParams.set('sslmode', driver === 'pg' ? 'verify-full' : 'require');
    url.searchParams.set('sslaccept', 'strict');
  }
  return url.toString();
}
