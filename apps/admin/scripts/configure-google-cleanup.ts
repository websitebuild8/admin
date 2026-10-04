import {config} from 'dotenv';
config({path:'.env.local',quiet:true});
import {database} from '../src/lib/db';
async function main() {
  const db=database();
  try {
    await db.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog');
    await db.$queryRaw`SELECT cron.schedule('igo-google-content-prune','17 * * * *','SELECT public.igo_prune_google_content();')`;
    await db.$executeRaw`SELECT public.igo_prune_google_content()`;
    const jobs=await db.$queryRaw<{active:boolean}[]>`SELECT active FROM cron.job WHERE jobname='igo-google-content-prune'`;
    if(!jobs.some(j=>j.active)) throw new Error('Google data cleanup is not active.');
    console.log('Google address-data cleanup is active. No Google API requests were made.');
    console.log({placesKeyConfigured:!!process.env.GOOGLE_PLACES_API_KEY,proofConfigured:(process.env.IGO_MAP_PROOF_SECRET?.length??0)>=32});
  } finally { await db.$disconnect(); }
}
main().catch(()=>{console.error('Could not configure Google data cleanup. Enable Supabase Cron and follow docs/google-maps-setup.md.');process.exitCode=1;});
