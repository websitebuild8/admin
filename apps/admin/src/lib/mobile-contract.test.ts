import {test} from 'node:test';
import assert from 'node:assert/strict';
import {approvedPrincipal,addressInput,registrationInput,quoteInput,publicOrderId,menuInput} from './mobile-contract';
const entrance={area:'Malé',building:'Example building',unit:'2A',instructions:'East entrance',latitude:4.1755,longitude:73.5093};
test('pending partner cannot fall back to customer despite an old customer role',()=>{
 const p={id:'p',primaryRole:'rider',roles:[{role:'rider',status:'Pending'},{role:'customer',status:'Active'}]};
 assert.equal(approvedPrincipal(p,null,{id:'r',status:'Active',documentsVerified:true}),null);
});
test('approved role also requires verified active entity binding',()=>{
 const p={id:'p',primaryRole:'restaurant',roles:[{role:'restaurant',status:'Active'}]};
 assert.equal(approvedPrincipal(p,null,null),null);
 assert.equal(approvedPrincipal(p,{id:'s',status:'Active',documentsVerified:false},null),null);
 assert.equal(approvedPrincipal(p,{id:'s',status:'Suspended',documentsVerified:true},null),null);
 assert.deepEqual(approvedPrincipal(p,{id:'s',status:'Active',documentsVerified:true},null),{role:'restaurant',id:'s'});
});
test('customer principal comes from an active customer application only',()=>{
 assert.deepEqual(approvedPrincipal({id:'p',primaryRole:'customer',roles:[{role:'customer',status:'Active'}]},null,null),{id:'p',role:'customer'});
 assert.equal(approvedPrincipal({id:'p',primaryRole:null,roles:[]},null,null),null);
});
test('addresses reject nonfinite/outside-island points and injected ownership fields',()=>{
 assert.ok(addressInput.safeParse(entrance).success);
 for(const patch of [{latitude:NaN},{longitude:Infinity},{latitude:4.216},{profileId:'other'},{kind:'pickup'}])assert.equal(addressInput.safeParse({...entrance,...patch}).success,false);
});
test('registration rejects admin/self-approval and requires restaurant pin or rider vehicle',()=>{
 const base={role:'customer',name:'Example person',phone:'+9607771234',area:'Malé',policyVersion:'draft-2026-10-04',acceptedPolicies:true};
 assert.ok(registrationInput.safeParse(base).success);
 for(const patch of [{role:'admin'},{status:'Active'},{clerkUserId:'other'},{acceptedPolicies:false},{role:'restaurant',businessName:'Example cafe'},{role:'rider'}])assert.equal(registrationInput.safeParse({...base,...patch}).success,false);
 assert.ok(registrationInput.safeParse({...base,role:'restaurant',businessName:'Example cafe',pickup:entrance}).success);
});
test('quotes accept quantities, never client prices, paid flags or customer IDs',()=>{
 const base={restaurantId:crypto.randomUUID(),addressId:crypto.randomUUID(),items:[{id:crypto.randomUUID(),quantity:1}]};
 assert.ok(quoteInput.safeParse(base).success);
 for(const patch of [{paid:true},{amount:1},{customerId:'other'},{items:[...base.items,...base.items]},{items:[{...base.items[0],quantity:0}]},{items:[{...base.items[0],price:1}]}])assert.equal(quoteInput.safeParse({...base,...patch}).success,false);
});
test('menu prices are integer laari and item ownership cannot be injected',()=>{
 const v={name:'Coffee',description:'',price:4500,available:true};assert.ok(menuInput.safeParse(v).success);
 for(const patch of [{price:45.5},{price:0},{restaurantId:'other'}])assert.equal(menuInput.safeParse({...v,...patch}).success,false);
});
test('public order references have high-entropy identifiers',()=>{
 const ids=Array.from({length:1000},publicOrderId);assert.equal(new Set(ids).size,ids.length);assert.ok(ids.every(id=>/^IGO-[A-F0-9]{16}$/.test(id)));
});
