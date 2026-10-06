import {config} from 'dotenv';
config({path:'.env.local',quiet:true});
import assert from 'node:assert/strict';
import {database} from '../src/lib/db';
import {createDemoSession,endDemoSession,rotateDemoKey,withDemoKey,withDemoOwner} from '../src/lib/demo-repository';
import {demoRead,demoWrite,demoIds} from '../src/lib/demo-sandbox';
import {MobileError} from '../src/lib/mobile-contract';
import {mobileUser} from '../src/lib/mobile-http';
import {NextRequest} from 'next/server';

async function main() {
  const db=database(),owner=`demo-verification-${crypto.randomUUID()}`;
  let session:{id:string;key:string}|undefined;
  const original=await Promise.all([db.order.count(),db.restaurant.count(),db.rider.count(),db.paymentAttempt.count(),db.checkoutQuote.count()]);
  try {
    session=await createDemoSession(owner);
    const key=session.key,id=session.id;
    // Demo access must never become a real Clerk participant session.
    await assert.rejects(()=>mobileUser(new NextRequest('https://igo.example/api/mobile/v1/account',{headers:{Authorization:`Bearer ${key}`}})),e=>e instanceof MobileError&&[401,503].includes(e.status));
    await assert.rejects(()=>withDemoOwner(id,'another-admin',s=>({result:s.state})),e=>e instanceof MobileError&&e.status===401);
    await assert.rejects(()=>withDemoKey('igo_demo_'+'0'.repeat(64),s=>({result:s.state})),e=>e instanceof MobileError&&e.status===401);
    const quote=await withDemoKey(key,s=>demoWrite(s,'customer','quote',{restaurantId:demoIds.restaurant,addressId:demoIds.address,items:[{id:s.menu[0].id,quantity:1}]})) as {id:string};
    const attempts=await Promise.all([1,2].map(()=>withDemoKey(key,s=>demoWrite(s,'customer','checkout',{quoteId:quote.id})) as Promise<{id:string}>));
    assert.equal(attempts[0].id,attempts[1].id);
    const approved=await Promise.all([1,2].map(()=>withDemoKey(key,s=>demoWrite(s,'customer','demo-payment',{attemptId:attempts[0].id,outcome:'Approved'})) as Promise<{orderId:string}>));
    assert.equal(approved[0].orderId,approved[1].orderId);
    const orderId=approved[0].orderId;
    await withDemoKey(key,s=>demoWrite(s,'restaurant','operations',{type:'preparation',id:orderId,status:'Order confirmed'}));
    const acceptance=await Promise.allSettled([1,2].map(()=>withDemoKey(key,s=>demoWrite(s,'rider','operations',{type:'accept-offer',id:orderId}))));
    assert.equal(acceptance.filter(r=>r.status==='fulfilled').length,1);
    for(const [role,type,status] of [['rider','delivery','Arrived at restaurant'],['restaurant','preparation','Ready for pickup'],['rider','delivery','Order picked up'],['rider','delivery','Arrived at customer'],['rider','delivery','Delivery complete']] as const)
      await withDemoKey(key,s=>demoWrite(s,role,'operations',{type,id:orderId,status}));
    const state=await withDemoOwner(id,owner,s=>({result:s.state}));
    assert.equal(state.orders.length,1);assert.equal(state.orders[0].status,'Delivered');assert.equal(state.riders[0].deliveries,1);
    for(const role of ['customer','restaurant','rider'] as const) {
      const feed=await withDemoKey(key,s=>({result:demoRead(s,role,'operations')})) as {orders:{status:string}[]};
      assert.equal(feed.orders[0].status,'Delivered');
    }
    assert.equal(await db.order.count({where:{id:orderId}}),0);
    const rotated=await rotateDemoKey(id,owner);
    await assert.rejects(()=>withDemoKey(key,s=>({result:s.state})),e=>e instanceof MobileError&&e.status===401);
    await withDemoKey(rotated.key,s=>({result:s.state.orders.length}));
    await db.demoSession.update({where:{id},data:{expiresAt:new Date(Date.now()-1000)}});
    await assert.rejects(()=>withDemoKey(rotated.key,s=>({result:s.state})),e=>e instanceof MobileError&&e.status===401);
    const isolation=await db.$queryRaw<{rls:boolean;anon:boolean;authenticated:boolean}[]>`SELECT relrowsecurity AS rls, has_table_privilege('anon', 'public."DemoSession"', 'SELECT') AS anon, has_table_privilege('authenticated', 'public."DemoSession"', 'SELECT') AS authenticated FROM pg_class WHERE oid='public."DemoSession"'::regclass`;
    assert.deepEqual(isolation,[{rls:true,anon:false,authenticated:false}]);
    const after=await Promise.all([db.order.count(),db.restaurant.count(),db.rider.count(),db.paymentAttempt.count(),db.checkoutQuote.count()]);
    assert.deepEqual(after,original);
    console.log('PASS: persistent shared demo, simultaneous checkout/payment retries, one rider acceptance, delivery flow across all roles, owner/key isolation, key rotation/expiry, private table permissions and unchanged real data.');
  } finally {
    if(session)await endDemoSession(session.id,owner);
    await db.$disconnect();
  }
}
main().catch(e=>{console.error('Demo verification failed.',{name:e?.name,code:e?.code,message:e instanceof MobileError?e.message:undefined});process.exitCode=1;});
