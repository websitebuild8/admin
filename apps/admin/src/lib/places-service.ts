import 'server-only';
import { createHash } from 'node:crypto';
import { database } from './db';
import { verifiedIdentity } from './mobile-http';
import { addressInput, MobileError } from './mobile-contract';
import { placesInput, placesProvider } from './places-provider';
import { z } from 'zod';
import { googleProof, validateGoogleLease } from './places-lease';

const DAY=86400000;
export function verifyGoogleAddress(user:string,address:z.infer<typeof addressInput>) {
  validateGoogleLease(user,address,process.env.IGO_MAP_PROOF_SECRET??'');
}

export async function lookupPlace(user:string,input:unknown) {
  const parsed=placesInput.safeParse(input);
  if (!parsed.success) throw new MobileError('Enter a building or address in your selected island.');
  const key=process.env.GOOGLE_PLACES_API_KEY;
  if (!key) throw new MobileError('Location search is not configured yet. You can choose an entrance on the map.',503);
  if ((process.env.IGO_MAP_PROOF_SECRET?.length??0)<32) throw new MobileError('Location search is not configured yet.',503);
  // A newly verified Clerk customer can search during registration, before a
  // Profile exists. Public unauthenticated callers never reach Google.
  const db=database();
  const tables=await db.$queryRaw<{available:boolean}[]>`SELECT to_regclass('cron.job') IS NOT NULL AS available`;
  if(!tables[0]?.available) throw new MobileError('Location search is not configured yet.',503);
  const jobs=await db.$queryRaw<{active:boolean}[]>`SELECT active FROM cron.job WHERE jobname='igo-google-content-prune'`;
  if(!jobs.some(j=>j.active)) throw new MobileError('Location search is not configured yet.',503);
  const now=Date.now(), hash=createHash('sha256').update(user).digest('hex');
  const globalLimit=Math.floor(Math.min(10000,Math.max(1,Number(process.env.IGO_MAP_DAILY_LIMIT)||3000)));
  const buckets=[
    {key:`global:${Math.floor(now/DAY)}`,limit:globalLimit,ttl:2*DAY},
    {key:`day:${hash}:${Math.floor(now/DAY)}`,limit:250,ttl:2*DAY},
    {key:`minute:${hash}:${Math.floor(now/60000)}`,limit:30,ttl:120000},
  ];
  await db.$transaction(async tx=>{
    for(const b of buckets) {
      // An atomic conditional UPSERT enforces the cap across Vercel instances.
      const rows=await tx.$queryRaw<{count:number}[]>`
        INSERT INTO "MapUsageBucket" ("key","count","expiresAt") VALUES (${b.key},1,${new Date(now+b.ttl)})
        ON CONFLICT ("key") DO UPDATE SET "count"="MapUsageBucket"."count"+1
        WHERE "MapUsageBucket"."count" < ${b.limit} RETURNING "count"`;
      if(!rows.length) throw new MobileError('Location search limit reached. Please try again later.',429);
    }
  });
  await verifiedIdentity(user);
  const v=parsed.data, result=await placesProvider(v,key);
  if(v.action==='search' || !('latitude' in result)) return result;
  // Delete Google coordinates after 26 days, comfortably inside Google's
  // 30-day limit. No suggestion text or full provider response is persisted.
  const google={placeId:result.placeId,expiresAt:new Date(now+26*DAY).toISOString(),proof:''};
  google.proof=googleProof(user,{area:v.area,latitude:result.latitude,longitude:result.longitude,google},process.env.IGO_MAP_PROOF_SECRET!);
  return {...result,google};
}
