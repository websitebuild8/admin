import {config} from 'dotenv';
config({path:'.env.local',quiet:true});
import assert from 'node:assert/strict';
import {database} from '../src/lib/db';
const rollback=new Error('ROLLBACK_VERIFICATION');
let stage='start';
async function main() {
  const db=database(), marker=`igo-map-check-${crypto.randomUUID()}`;
  try {
    // Establish the remote pool connection before the interactive transaction's
    // acquisition window; a cold TLS connection can exceed Prisma's default 2s.
    await db.$queryRaw`SELECT 1`;
    await db.$transaction(async tx=>{
      stage='profile fixture';const profile=await tx.profile.create({data:{clerkUserId:marker,name:'Map verification'}});
      const google={placeId:'verification-place',expiresAt:new Date(Date.now()-86400000).toISOString(),proof:'a'.repeat(64)};
      const pin={area:'Malé',building:'User-entered building',unit:'2A',instructions:'Side entrance',latitude:4.1755,longitude:73.5093};
      const source={...pin,google};
      stage='address fixtures';const address=await tx.savedAddress.create({data:{profileId:profile.id,kind:'delivery',...source}});
      const manual=await tx.savedAddress.create({data:{profileId:profile.id,kind:'pickup',...pin}});
      stage='restaurant fixture';const restaurant=await tx.restaurant.create({data:{name:marker,initials:'MV',cuisine:'Test',area:'Malé',contact:'Test',acceptingOrders:true,pickupAddress:source,pendingPickupAddress:source,location:{lat:pin.latitude,lng:pin.longitude}}});
      stage='order fixture';const order=await tx.order.create({data:{customerId:profile.id,customer:'Verification',restaurantId:restaurant.id,items:'Verification',amount:100,area:'Malé',address:pin.building,paymentRef:marker,pickupAddress:source,addressSnapshot:source,destination:{lat:pin.latitude,lng:pin.longitude}}});
      stage='quote fixture';const quote=await tx.checkoutQuote.create({data:{customerId:profile.id,restaurantId:restaurant.id,amount:100,expiresAt:new Date(),snapshot:{pickup:source,destination:source,amount:100,address:pin.building}}});
      stage='cleanup';await tx.$executeRaw`SELECT public.igo_prune_google_content()`;
      stage='cleanup assertions';
      assert.equal(await tx.savedAddress.findUnique({where:{id:address.id}}),null);
      assert.ok(await tx.savedAddress.findUnique({where:{id:manual.id}}));
      const r=await tx.restaurant.findUniqueOrThrow({where:{id:restaurant.id}});
      assert.equal(r.pickupAddress,null);assert.equal(r.pendingPickupAddress,null);assert.equal(r.location,null);assert.equal(r.acceptingOrders,false);
      const o=await tx.order.findUniqueOrThrow({where:{id:order.id}});
      assert.equal(o.pickupAddress,null);assert.equal(o.addressSnapshot,null);assert.equal(o.destination,null);assert.equal(o.address,pin.building);
      assert.deepEqual((await tx.checkoutQuote.findUniqueOrThrow({where:{id:quote.id}})).snapshot,{amount:100,address:pin.building});
      stage='table protections';const security=await tx.$queryRaw<{rls:boolean;anon:boolean;authenticated:boolean}[]>`SELECT relrowsecurity AS rls,has_table_privilege('anon',oid,'SELECT') AS anon,has_table_privilege('authenticated',oid,'SELECT') AS authenticated FROM pg_class WHERE oid='public."MapUsageBucket"'::regclass`;
      assert.ok(security[0].rls&&!security[0].anon&&!security[0].authenticated);
      // Exercise the actual PostgreSQL conditional UPSERT used by the proxy.
      stage='atomic cap';const expires=new Date(Date.now()+120000);
      for(let i=0;i<4;i++) {
        const rows=await tx.$queryRaw<{count:number}[]>`INSERT INTO "MapUsageBucket" ("key","count","expiresAt") VALUES (${marker},1,${expires}) ON CONFLICT ("key") DO UPDATE SET "count"="MapUsageBucket"."count"+1 WHERE "MapUsageBucket"."count" < 3 RETURNING "count"`;
        assert.equal(rows.length,i===3?0:1);
      }
      throw rollback;
    },{maxWait:15000,timeout:60000});
  } catch(error) { if(error!==rollback) throw error; }
  finally { await db.$disconnect(); }
  console.log('PASS: expiry removes Google coordinate copies, retains user/manual records, protects counters and enforces atomic limits. All verification writes rolled back.');
}
main().catch(error=>{console.error('Google retention verification failed.',{stage,name:error?.name,code:error?.code,databaseCode:error?.meta?.code,...(error instanceof assert.AssertionError?{actual:error.actual,expected:error.expected}:{})});process.exitCode=1;});
