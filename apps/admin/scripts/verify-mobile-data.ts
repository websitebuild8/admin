import {config} from 'dotenv';
config({path:'.env.local',quiet:true});
import assert from 'node:assert/strict';
import {database} from '../src/lib/db';
import {account,saveAddress,saveMenu,quote,checkout} from '../src/lib/mobile-service';
import {mutate} from '../src/lib/repository';
import {policyVersion,MobileError} from '../src/lib/mobile-contract';
async function main(){
const db=database(),marker=`igo-verification-${crypto.randomUUID()}`;
const users=['customer','other','restaurant','rider','other-restaurant'].map(s=>`${marker}-${s}`);
const pin={area:'Malé',building:'Verification entrance',unit:'2A',instructions:'East entrance',latitude:4.1755,longitude:73.5093};
const profiles:string[]=[],restaurants:string[]=[],riders:string[]=[];
const initialOrders=await db.order.count();
try{
 for(let i=0;i<users.length;i++){
  const role=i===2||i===4?'restaurant':i===3?'rider':'customer';
  const p=await db.profile.create({data:{clerkUserId:users[i],name:'Verification account',primaryRole:role,phone:'+9607771234',roles:{create:{role,status:i===2||i===3?'Pending':'Active'}},consents:{create:{version:policyVersion()}}}});profiles.push(p.id);
 }
 const r=await db.restaurant.create({data:{clerkUserId:users[2],name:'Verification cafe',initials:'VC',cuisine:'Cafe',area:'Malé',contact:'+9607771234',pendingPickupAddress:pin}});restaurants.push(r.id);
 const r2=await db.restaurant.create({data:{clerkUserId:users[4],name:'Other verification cafe',initials:'OC',cuisine:'Cafe',area:'Malé',contact:'+9607771234',status:'Active',documentsVerified:true,pickupAddress:pin}});restaurants.push(r2.id);
 const rider=await db.rider.create({data:{clerkUserId:users[3],name:'Verification rider',initials:'VR',area:'Malé',phone:'+9607771234'}});riders.push(rider.id);
 assert.equal((await account(users[3])).access,null);
 await assert.rejects(()=>saveMenu(users[2],{name:'Coffee',description:'',price:4500,available:true}),e=>e instanceof MobileError&&e.status===403);
 await mutate({type:'partner-status',kind:'restaurant',id:r.id,status:'Active',verified:true,reason:''},marker);
 await mutate({type:'partner-status',kind:'rider',id:rider.id,status:'Active',verified:true,reason:''},marker);
 assert.equal((await account(users[2])).access?.role,'restaurant');assert.equal((await account(users[3])).access?.role,'rider');
 const approved=await db.restaurant.findUniqueOrThrow({where:{id:r.id}});assert.deepEqual(approved.pickupAddress,pin);assert.equal(approved.pendingPickupAddress,null);
 const item=await saveMenu(users[2],{name:'Coffee',description:'Example item',price:4500,available:true});if(!('id' in item))throw new Error('Fixture item missing');
 await assert.rejects(()=>saveMenu(users[4],{id:item.id,name:'Other item',description:'',price:4500,available:true}),e=>e instanceof MobileError);
 await db.restaurant.update({where:{id:r.id},data:{acceptingOrders:true}});
 const a=await saveAddress(users[0],pin),other=await saveAddress(users[1],pin);
 await assert.rejects(()=>quote(users[0],{restaurantId:r.id,addressId:other.id,items:[{id:item.id,quantity:2}]}),e=>e instanceof MobileError);
 const q=await quote(users[0],{restaurantId:r.id,addressId:a.id,items:[{id:item.id,quantity:2}]});
 const fee=(await db.serviceSettings.findUnique({where:{id:'default'}}))?.deliveryFee??2500;assert.equal(q.amount,9000+fee);
 await saveAddress(users[0],{...pin,building:'Changed entrance'});await saveAddress(users[2],{...pin,building:'Proposed pickup change'});
 const persisted=await db.checkoutQuote.findUniqueOrThrow({where:{id:q.id}});assert.equal((persisted.snapshot as {destination:{building:string}}).destination.building,pin.building);
 assert.equal((await db.restaurant.findUniqueOrThrow({where:{id:r.id}})).pickupAddress&&((await db.restaurant.findUniqueOrThrow({where:{id:r.id}})).pickupAddress as {building:string}).building,pin.building);
 await assert.rejects(()=>checkout(users[0],{quoteId:q.id}),e=>e instanceof MobileError&&e.status===503);assert.equal(await db.order.count(),initialOrders);
 await mutate({type:'partner-status',kind:'restaurant',id:r.id,status:'Suspended',verified:true,reason:'Verification suspension only'},marker);assert.equal((await account(users[2])).access,null);
 const protectedTables=await db.$queryRaw<Array<{table_name:string;rls:boolean;anon:boolean;authenticated:boolean}>>`SELECT c.relname AS table_name,c.relrowsecurity AS rls,has_table_privilege('anon',c.oid,'SELECT') AS anon,has_table_privilege('authenticated',c.oid,'SELECT') AS authenticated FROM pg_class c JOIN pg_namespace n ON c.relnamespace=n.oid WHERE n.nspname='public' AND c.relname IN ('SavedAddress','MenuItem','PolicyAcceptance','CheckoutQuote','PaymentAttempt')`;
 assert.equal(protectedTables.length,5);assert.ok(protectedTables.every(t=>t.rls&&!t.anon&&!t.authenticated));
 console.log('PASS: approval bindings, owned addresses/menu, immutable quotes, blocked payment submission, revoked access and all 5 new table protections.');
} finally {
 await db.paymentAttempt.deleteMany({where:{quote:{customerId:{in:profiles}}}});
 await db.checkoutQuote.deleteMany({where:{customerId:{in:profiles}}});
 await db.menuItem.deleteMany({where:{restaurantId:{in:restaurants}}});
 await db.restaurant.deleteMany({where:{id:{in:restaurants}}});await db.rider.deleteMany({where:{id:{in:riders}}});
 await db.savedAddress.deleteMany({where:{profileId:{in:profiles}}});await db.policyAcceptance.deleteMany({where:{profileId:{in:profiles}}});await db.roleApplication.deleteMany({where:{profileId:{in:profiles}}});await db.profile.deleteMany({where:{id:{in:profiles}}});
 await db.auditEvent.deleteMany({where:{actor:{in:[marker,...users]}}});await db.$disconnect();
 console.log('Verification fixtures removed.');
}

}
main().catch(e=>{console.error(e);process.exitCode=1;});
