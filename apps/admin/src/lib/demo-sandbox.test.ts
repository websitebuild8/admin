import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createSandbox,demoIds,demoRead,demoWrite,demoAdminCommand,type Sandbox,type DemoRole} from './demo-sandbox';
const now='2026-10-07T12:00:00.000Z';
function write(s:Sandbox,role:DemoRole,resource:string,data:unknown,time=now) {return demoWrite(s,role,resource,data,time);}
function quoted(s=createSandbox()) {
  const value=write(s,'customer','quote',{restaurantId:demoIds.restaurant,addressId:demoIds.address,items:[{id:s.menu[0].id,quantity:2}],note:'Demo only'});
  const q=value.sandbox.quotes[0];
  const start=write(value.sandbox,'customer','checkout',{quoteId:q.id});
  return {s:start.sandbox,q,attempt:start.sandbox.attempts[0]};
}
function approved() {const {s,attempt}=quoted();return write(s,'customer','demo-payment',{attemptId:attempt.id,outcome:'Approved'}).sandbox;}
test('demo bank prices on the server and submits only on approval; replays create one order',()=>{
  const {s,q,attempt}=quoted();assert.equal(q.amount,11500);assert.equal(s.state.orders.length,0);
  const a=write(s,'customer','demo-payment',{attemptId:attempt.id,outcome:'Approved'});
  assert.equal(s.state.orders.length,0);assert.equal(a.sandbox.state.orders.length,1);
  assert.equal(a.sandbox.state.orders[0].amount,11500);assert.match(a.sandbox.state.orders[0].publicId!,/^DEMO-[A-F0-9]{16}$/);
  assert.match(a.sandbox.state.orders[0].paymentRef,/^DEMO-/);
  const replay=write(a.sandbox,'customer','demo-payment',{attemptId:attempt.id,outcome:'Approved'},'2026-10-08T12:00:00.000Z');
  assert.equal(replay.sandbox.state.orders.length,1);assert.deepEqual(replay.result,a.result);
  assert.equal(write(replay.sandbox,'customer','checkout',{quoteId:q.id}).sandbox.attempts.length,1);
});
test('decline and cancellation never create orders and cannot be changed into approval',()=>{
  for(const outcome of ['Declined','Cancelled']) {
    const {s,attempt}=quoted();const result=write(s,'customer','demo-payment',{attemptId:attempt.id,outcome});
    assert.equal(result.sandbox.state.orders.length,0);
    assert.throws(()=>write(result.sandbox,'customer','demo-payment',{attemptId:attempt.id,outcome:'Approved'}),/final result/);
  }
});
test('expired quotes, extra price/paid/card fields and foreign session attempts fail closed',()=>{
  const {s,q,attempt}=quoted();
  assert.throws(()=>write(s,'customer','demo-payment',{attemptId:attempt.id,outcome:'Approved'},q.expiresAt),/expired/);
  assert.throws(()=>write(s,'customer','checkout',{quoteId:q.id,paid:true}),/Unrecognized/);
  assert.throws(()=>write(s,'customer','demo-payment',{attemptId:attempt.id,outcome:'Approved',cardNumber:'test'}),/Unrecognized/);
  assert.throws(()=>write(createSandbox(),'customer','demo-payment',{attemptId:attempt.id,outcome:'Approved'}),/not found/);
  assert.throws(()=>write(s,'customer','quote',{restaurantId:demoIds.restaurant,addressId:demoIds.address,items:[{id:s.menu[0].id,quantity:1}],amount:1}),/Unrecognized/);
});
test('stock, price, closed restaurant and disabled service area are rechecked on demo approval',()=>{
  for(const change of [(s:Sandbox)=>{s.menu[0].available=false;},(s:Sandbox)=>{s.menu[0].price++;},(s:Sandbox)=>{s.state.restaurants[0].acceptingOrders=false;},(s:Sandbox)=>{s.state.settings.maleEnabled=false;}]) {
    const {s,attempt}=quoted();change(s);
    assert.throws(()=>write(s,'customer','demo-payment',{attemptId:attempt.id,outcome:'Approved'}),/changed|closed|disabled/);
    assert.equal(s.state.orders.length,0);assert.equal(s.attempts[0].status,'Pending');
  }
});
test('shared demo completes customer → restaurant → rider → admin workflow with scoped views',()=>{
  let s=approved();const id=s.state.orders[0].id;
  assert.throws(()=>write(s,'customer','operations',{type:'preparation',id,status:'Order confirmed'}),/Not authorized/);
  assert.throws(()=>write(s,'restaurant','demo-payment',{attemptId:s.attempts[0].id,outcome:'Approved'}),/customer demo/);
  s=write(s,'restaurant','operations',{type:'preparation',id,status:'Order confirmed'}).sandbox;
  const offers=demoRead(s,'rider','operations',{},now) as {offers:{orderId:string}[]};assert.equal(offers.offers[0].orderId,id);
  s=write(s,'rider','operations',{type:'accept-offer',id}).sandbox;
  assert.throws(()=>write(s,'rider','operations',{type:'accept-offer',id}),/already accepted/);
  assert.throws(()=>write(s,'rider','operations',{type:'delivery',id,status:'Order picked up'}),/must be ready/);
  s=write(s,'rider','operations',{type:'delivery',id,status:'Arrived at restaurant'}).sandbox;
  s=write(s,'restaurant','operations',{type:'preparation',id,status:'Ready for pickup'}).sandbox;
  s=write(s,'rider','operations',{type:'delivery',id,status:'Order picked up'}).sandbox;
  s=write(s,'rider','operations',{type:'delivery',id,status:'Arrived at customer'}).sandbox;
  s=write(s,'rider','operations',{type:'delivery',id,status:'Delivery complete'}).sandbox;
  s=write(s,'rider','operations',{type:'delivery',id,status:'Delivery complete'}).sandbox;
  assert.equal(s.state.orders[0].status,'Delivered');assert.equal(s.state.riders[0].deliveries,1);
  const customer=demoRead(s,'customer','operations',{},now) as {orders:Record<string,unknown>[]};
  const restaurant=demoRead(s,'restaurant','operations',{},now) as typeof customer;
  assert.equal(customer.orders[0].status,'Delivered');assert.ok(customer.orders[0].entrances);
  assert.equal(restaurant.orders[0].entrances,undefined);assert.equal(restaurant.orders[0].job,undefined);
  assert.equal(s.state.riders[0].location,null);
});
test('admin actions share the sandbox and never allow mobile admin commands or real registration',()=>{
  let s=approved();const id=s.state.orders[0].id;
  s=demoAdminCommand(s,{type:'preparation',id,status:'Order confirmed'},now);
  s=demoAdminCommand(s,{type:'assign-rider',id,riderId:demoIds.rider},now);
  assert.equal(s.state.orders[0].riderId,demoIds.rider);
  assert.throws(()=>write(s,'rider','operations',{type:'settings',values:s.state.settings}),/Invalid demo mobile/);
  assert.throws(()=>write(s,'customer','register',{}),/unavailable/);
});
test('menu changes are shared, preserve purchased descriptions and paginate at ten',()=>{
  let s=approved();const original=s.state.orders[0].items;
  s=write(s,'restaurant','menu-delete',{id:s.menu[0].id}).sandbox;
  assert.equal(s.state.orders[0].items,original);
  assert.throws(()=>write(s,'customer','menu',{name:'Coffee',description:'',category:'Drinks',price:1000,available:true}),/restaurant demo/);
  for(let i=0;i<12;i++)s=write(s,'restaurant','menu',{name:`Demo meal ${i}`,description:'',category:'Meals',price:2000,available:true}).sandbox;
  const first=demoRead(s,'customer','catalog',{restaurantId:demoIds.restaurant,page:'1'}) as {items:unknown[];total:number};
  const second=demoRead(s,'customer','catalog',{restaurantId:demoIds.restaurant,page:'2'}) as typeof first;
  assert.equal(first.items.length,10);assert.equal(second.items.length,3);assert.equal(first.total,13);
});
