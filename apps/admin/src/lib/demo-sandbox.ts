import { z } from 'zod';
import { menuImageViewSchema, type MenuImageView } from './menu-image-contract';
import { applyCommand, commandSchema, orderSchema, stateSchema, WorkflowError, type State } from './domain';
import { initialWorkflow, type Principal } from './fulfilment';
import { addressInput, addressLabel, island, menuInput, menuDeleteInput, menuStockInput, mobileRole, MobileError, quoteInput } from './mobile-contract';
import { orderView } from './workflow';

// These identities exist only inside DemoSession.payload, never in real tables.
export const demoIds = {
  customer: '8b004daa-4616-4f93-a83d-000000000001',
  restaurant: '8b004daa-4616-4f93-a83d-000000000002',
  rider: '8b004daa-4616-4f93-a83d-000000000003',
  address: '8b004daa-4616-4f93-a83d-000000000004',
};
export type DemoRole = z.infer<typeof mobileRole>;
const pickup = addressInput.parse({area:'Malé',building:'Demo café entrance',latitude:4.1755,longitude:73.5093});
const destination = addressInput.parse({area:'Malé',building:'Demo delivery entrance',unit:'Sample floor 2',latitude:4.178,longitude:73.515});
const lineSchema = z.object({id:z.uuid(),name:z.string(),unitPrice:z.number().int().positive(),quantity:z.number().int().positive()});
const quoteSchema = z.object({
  id:z.uuid(),amount:z.number().int().positive(),currency:z.literal('MVR'),expiresAt:z.iso.datetime(),
  snapshot:z.object({customer:z.string(),restaurant:z.string(),pickup:addressInput,destination:addressInput,address:z.string(),lineItems:z.array(lineSchema),note:z.string(),subtotal:z.number().int(),deliveryFee:z.number().int()}),
});
const attemptSchema = z.object({id:z.uuid(),quoteId:z.uuid(),status:z.enum(['Pending','Approved','Declined','Cancelled']),orderId:z.string().nullable(),createdAt:z.iso.datetime(),completedAt:z.iso.datetime().nullable()});
export const sandboxSchema = z.object({state:stateSchema,menu:z.array(menuInput.omit({draftId:true,imageId:true}).extend({id:z.uuid(),image:menuImageViewSchema.nullable().optional()})),quotes:z.array(quoteSchema),attempts:z.array(attemptSchema)});
export type Sandbox = z.infer<typeof sandboxSchema>;

export function createSandbox(): Sandbox {
  return sandboxSchema.parse({
    state:{
      restaurants:[{id:demoIds.restaurant,name:'Demo Café',initials:'DC',cuisine:'Coffee · Desserts',area:'Malé',contact:'Fictional partner',status:'Active',prepTime:15,color:'coffee',documentsVerified:true,acceptingOrders:true,pickupAddress:pickup,location:{lat:pickup.latitude,lng:pickup.longitude}}],
      riders:[{id:demoIds.rider,name:'Demo rider',initials:'DR',area:'Malé',phone:'Fictional contact',status:'Active',online:true,deliveries:0,documentsVerified:true}],
      orders:[],tickets:[],refunds:[],activity:[],notifications:[],
      settings:{businessName:'iGO Demo',supportEmail:'',deliveryFee:2500,maleEnabled:true,hulhumaleEnabled:true},
    },
    menu:[
      {id:'8b004daa-4616-4f93-a83d-000000000010',name:'Iced latte',description:'A fictional drink for testing',category:'Coffee',price:4500,available:true},
      {id:'8b004daa-4616-4f93-a83d-000000000011',name:'Chocolate cake',description:'A fictional dessert for testing',category:'Desserts',price:6000,available:true},
    ],quotes:[],attempts:[],
  });
}
function parse<T extends z.ZodType>(schema:T,value:unknown):z.infer<T> {
  const r=schema.safeParse(value);
  if(!r.success) throw new MobileError(r.error.issues[0]?.message ?? 'Invalid demo request.');
  return r.data;
}
function requireRole(role:DemoRole,expected:DemoRole) { if(role!==expected) throw new MobileError(`${expected} demo access required.`,403); }
function principal(role:DemoRole):Principal {return {role,id:demoIds[role]};}
function paged<T>(items:T[],page:number) {
  if(!Number.isInteger(page)||page<1||page>10000) throw new MobileError('Invalid page.');
  return {items:items.slice((page-1)*10,page*10),page,pageSize:10,total:items.length};
}
function active(role:DemoRole,s:Sandbox) {
  const partner=role==='restaurant'?s.state.restaurants[0]:role==='rider'?s.state.riders[0]:null;
  if(partner&&(partner.status!=='Active'||!partner.documentsVerified)) throw new MobileError('This demo partner is not active.',403);
}
export function demoRead(s:Sandbox,role:DemoRole,resource:string,query:Record<string,string>={},now=new Date().toISOString()):unknown {
  active(role,s);
  const p=principal(role),page=Number(query.page??1),r=s.state.restaurants[0],rider=s.state.riders[0];
  if(resource==='account') return {
    demo:true,registered:true,name:role==='customer'?'Demo customer':role==='restaurant'?r.name:rider.name,
    role,status:'Active',access:p,addresses:role==='customer'?[{id:demoIds.address,kind:'delivery',...destination}]:[],
    restaurant:role==='restaurant'?{id:r.id,name:r.name,area:r.area,acceptingOrders:r.acceptingOrders,pickup:r.pickupAddress,pendingPickup:r.pendingPickupAddress}:null,
    rider:role==='rider'?{id:rider.id,area:rider.area,online:rider.online}:null,
    policy:{version:'demo-only',published:false,accepted:true,links:{}},paymentsEnabled:false,demoCheckoutEnabled:true,
  };
  if(resource==='operations') {
    const orders=s.state.orders.filter(o=>role==='customer'?o.customerId===p.id:role==='restaurant'?o.restaurantId===p.id:o.riderId===p.id);
    const list=paged(orders,page);
    const offers=role==='rider'?s.state.orders.filter(o=>!o.riderId).flatMap(o=>o.workflow.offers.filter(f=>f.riderId===p.id&&Date.parse(f.expiresAt)>Date.parse(now)).map(f=>({orderId:o.id,publicId:o.publicId,restaurant:r.name,area:r.area,items:o.items,expiresAt:f.expiresAt}))).slice(0,10):[];
    return {demo:true,role,page,pageSize:10,total:list.total,orders:list.items.map(o=>({...orderView(s.state,o,p),demo:true})),offers,notifications:s.state.notifications.filter(n=>n.recipient===`${role}:${p.id}`).slice(0,10)};
  }
  const search=(query.q??'').trim().toLowerCase();
  if(resource==='catalog') {
    if(query.restaurantId) {
      if(query.restaurantId!==r.id) throw new MobileError('Demo restaurant not found.',404);
      const available=s.menu.filter(m=>m.available);
      const items=available.filter(m=>(!search||`${m.name} ${m.description}`.toLowerCase().includes(search))&&(!query.category||query.category==='All'||m.category===query.category));
      return {...paged(items,page),categories:[...new Set(available.map(m=>m.category))],restaurant:{id:r.id,name:r.name,area:r.area,acceptingOrders:r.status==='Active'&&r.documentsVerified&&r.acceptingOrders}};
    }
    const visible=r.status==='Active'&&r.documentsVerified&&s.menu.some(m=>m.available)&&(!search||`${r.name} ${r.cuisine}`.toLowerCase().includes(search))&&(!query.cuisine||query.cuisine==='All'||r.cuisine.toLowerCase().includes(query.cuisine.toLowerCase()));
    return paged(visible?[{id:r.id,name:r.name,cuisine:r.cuisine,area:r.area,prepTime:r.prepTime,acceptingOrders:r.acceptingOrders,pickup:r.pickupAddress}]:[],page);
  }
  if(resource==='menu') {
    requireRole(role,'restaurant');
    const filtered=s.menu.filter(m=>(!search||`${m.name} ${m.description}`.toLowerCase().includes(search))&&(!query.stock||query.stock==='All'||m.available===(query.stock==='Available')));
    return {...paged(filtered,page),availableCount:s.menu.filter(m=>m.available).length,itemCount:s.menu.length};
  }
  throw new MobileError('This feature is unavailable in the fictional demo.',404);
}

function addNotice(s:Sandbox,orderId:string,text:string,now:string) {
  for(const recipient of [`customer:${demoIds.customer}`,`restaurant:${demoIds.restaurant}`])
    s.state.notifications.unshift({id:crypto.randomUUID(),orderId,recipient,text,time:now});
}
function checkMenu(s:Sandbox,q:Sandbox['quotes'][number]) {
  const r=s.state.restaurants[0];
  if(r.status!=='Active'||!r.documentsVerified||!r.acceptingOrders) throw new MobileError('Demo restaurant is closed.',409);
  if(!s.state.settings.maleEnabled) throw new MobileError('Demo service area is disabled.',409);
  for(const line of q.snapshot.lineItems) {
    const item=s.menu.find(m=>m.id===line.id);
    if(!item?.available||item.price!==line.unitPrice||item.name!==line.name) throw new MobileError('The demo menu changed. Review a new total.',409);
  }
}
function ownedQuote(s:Sandbox,id:string,now:string) {
  const q=s.quotes.find(q=>q.id===id);
  if(!q) throw new MobileError('Demo quote not found.',404);
  if(Date.parse(q.expiresAt)<=Date.parse(now)) throw new MobileError('Demo quote expired. Review your total again.',409);
  return q;
}
export function demoWrite(input:Sandbox,role:DemoRole,resource:string,raw:unknown,now=new Date().toISOString(),photo?:{image:MenuImageView|null}) {
  const s=sandboxSchema.parse(structuredClone(input));active(role,s);
  let result:unknown={ok:true,demo:true};
  if(resource==='quote') {
    requireRole(role,'customer');const v=parse(quoteInput,raw);
    if(v.restaurantId!==demoIds.restaurant||v.addressId!==demoIds.address) throw new MobileError('Use the fictional demo restaurant and address.',404);
    if(s.quotes.length>=200) throw new MobileError('Reset this demo session before placing more test orders.',409);
    const lines=v.items.map(i=>{const m=s.menu.find(m=>m.id===i.id&&m.available);if(!m) throw new MobileError('Demo menu availability changed.',409);return {id:m.id,name:m.name,unitPrice:m.price,quantity:i.quantity};});
    const subtotal=lines.reduce((t,l)=>t+l.unitPrice*l.quantity,0),deliveryFee=s.state.settings.deliveryFee;
    const q=parse(quoteSchema,{id:crypto.randomUUID(),amount:subtotal+deliveryFee,currency:'MVR',expiresAt:new Date(Date.parse(now)+15*60000).toISOString(),snapshot:{customer:'Demo customer',restaurant:s.state.restaurants[0].name,pickup:s.state.restaurants[0].pickupAddress,destination,address:addressLabel(destination),lineItems:lines,note:v.note,subtotal,deliveryFee}});
    checkMenu(s,q);s.quotes.push(q);result={...q,demo:true,paymentsEnabled:false,demoCheckoutEnabled:true};
  } else if(resource==='checkout') {
    requireRole(role,'customer');const {quoteId}=parse(z.object({quoteId:z.uuid()}).strict(),raw);
    // Replays of an already completed attempt remain stable even after expiry.
    let attempt=s.attempts.find(a=>a.quoteId===quoteId);
    if(!attempt) {
      const q=ownedQuote(s,quoteId,now);checkMenu(s,q);
      attempt={id:crypto.randomUUID(),quoteId,status:'Pending',orderId:null,createdAt:now,completedAt:null};s.attempts.push(attempt);
    }
    const q=s.quotes.find(q=>q.id===quoteId)!;
    result={...attempt,demo:true,amount:q.amount,currency:q.currency,gateway:'iGO Demo Bank'};
  } else if(resource==='demo-payment') {
    requireRole(role,'customer');const {attemptId,outcome}=parse(z.object({attemptId:z.uuid(),outcome:z.enum(['Approved','Declined','Cancelled'])}).strict(),raw);
    const attempt=s.attempts.find(a=>a.id===attemptId);
    if(!attempt) throw new MobileError('Demo payment attempt not found.',404);
    if(attempt.status!=='Pending') {
      if(attempt.status!==outcome) throw new MobileError('This demo payment already has a final result. Review a new total to try again.',409);
      result={...attempt,demo:true};
    } else {
      const q=ownedQuote(s,attempt.quoteId,now);
      if(outcome==='Approved') {
        checkMenu(s,q);
        if(s.state.orders.length>=100) throw new MobileError('Reset this demo session before placing more test orders.',409);
        const publicId=`DEMO-${crypto.randomUUID().replaceAll('-','').slice(0,16).toUpperCase()}`;
        const workflow=initialWorkflow('Awaiting restaurant',null);
        workflow.events.push({id:crypto.randomUUID(),text:'Demo bank approved · no money charged',at:now,actor:'Demo bank'});
        const order=orderSchema.parse({id:publicId,publicId,customerId:demoIds.customer,customer:'Demo customer',restaurantId:demoIds.restaurant,
          items:q.snapshot.lineItems.map(l=>`${l.name} × ${l.quantity}`).join(', '),amount:q.amount,area:q.snapshot.destination.area,
          address:q.snapshot.address,pickupAddress:q.snapshot.pickup,addressSnapshot:q.snapshot.destination,destination:{lat:q.snapshot.destination.latitude,lng:q.snapshot.destination.longitude},
          status:'Awaiting restaurant',riderId:null,time:now,paid:true,paymentRef:`DEMO-${attempt.id}`,workflow});
        s.state.orders.unshift(order);attempt.orderId=order.id;
        addNotice(s,order.id,'Demo order submitted · no real payment or delivery',now);
        s.state.activity.unshift({id:crypto.randomUUID(),text:`${order.id}: simulated bank approval; no money charged`,actor:'Demo bank',time:now});
      }
      attempt.status=outcome;attempt.completedAt=now;result={...attempt,demo:true};
    }
  } else if(resource==='operations') {
    let value=raw;
    if(value&&typeof value==='object'&&'type' in value&&value.type==='accept-offer') value={...value,riderId:demoIds.rider};
    const command=parse(commandSchema,value);
    if(!['preparation','delivery','accept-offer'].includes(command.type)) throw new MobileError('Invalid demo mobile action.',403);
    try{s.state=applyCommand(s.state,command,`Demo ${role}`,now,principal(role));}
    catch(e){throw new MobileError(e instanceof WorkflowError?e.message:'Demo update failed.',409);}
  } else if(['menu','menu-delete','menu-stock'].includes(resource)) {
    requireRole(role,'restaurant');
    if(resource==='menu') {
      const {id,draftId,imageId,...fields}=parse(menuInput,raw);
      const target=id??draftId??crypto.randomUUID(),idx=s.menu.findIndex(m=>m.id===target);
      if(id&&idx<0)throw new MobileError('Demo menu item not found.',404);
      if(imageId && (!photo || photo.image?.id!==imageId))throw new MobileError('Upload a food photo before saving it.',409);
      const image=imageId===undefined?s.menu[idx]?.image??null:imageId===null?null:photo!.image;
      const item={...fields,id:target,image};
      if(idx>=0)s.menu[idx]=item;
      else {if(s.menu.length>=100)throw new MobileError('Demo menu limit reached.',409);s.menu.push(item);}
      result=item;
    } else {
      const v=resource==='menu-delete'?parse(menuDeleteInput,raw):parse(menuStockInput,raw);
      const item=s.menu.find(m=>m.id===v.id);if(!item) throw new MobileError('Demo menu item not found.',404);
      if('available' in v && typeof v.available==='boolean') item.available=v.available;else s.menu=s.menu.filter(m=>m.id!==v.id);
    }
  } else if(resource==='availability') {
    const v=parse(z.object({online:z.boolean(),area:island.optional()}).strict(),raw);
    if(role==='restaurant') {
      if(v.online&&!s.menu.some(m=>m.available)) throw new MobileError('Add an available demo menu item first.');
      s.state.restaurants[0].acceptingOrders=v.online;
    } else if(role==='rider') {
      if(s.state.orders.some(o=>o.riderId===demoIds.rider&&o.status!=='Delivered')&&(!v.online||v.area)) throw new MobileError('Complete the demo delivery before changing availability.',409);
      s.state.riders[0].online=v.online;if(v.area)s.state.riders[0].area=v.area;
    } else throw new MobileError('Partner demo access required.',403);
    result=demoRead(s,role,'account');
  } else if(resource==='support') {
    requireRole(role,'customer');const v=parse(z.object({orderId:z.string(),subject:z.string().trim().min(10).max(500)}).strict(),raw);
    const order=s.state.orders.find(o=>o.id===v.orderId&&o.customerId===demoIds.customer);
    if(!order) throw new MobileError('Demo order not found.',404);
    if(s.state.tickets.some(t=>t.orderId===order.id&&t.status==='Open')) throw new MobileError('An open demo support case already exists.',409);
    s.state.tickets.unshift({id:`DEMO-CASE-${crypto.randomUUID()}`,orderId:order.id,subject:v.subject,customer:order.customer,priority:'Normal',status:'Open'});
  } else throw new MobileError('This feature is unavailable in the fictional demo.',404);
  s.state.notifications=s.state.notifications.slice(0,500);s.state.activity=s.state.activity.slice(0,500);
  return {sandbox:s,result};
}
export function demoAdminCommand(input:Sandbox,raw:unknown,now=new Date().toISOString()):Sandbox {
  const s=sandboxSchema.parse(structuredClone(input));
  try{s.state=applyCommand(s.state,parse(commandSchema,raw),'Demo admin',now);}
  catch(e){if(e instanceof WorkflowError)throw new MobileError(e.message,409);throw e;}
  s.state.notifications=s.state.notifications.slice(0,500);s.state.activity=s.state.activity.slice(0,500);
  return s;
}
export function demoAdminState(s:Sandbox):State { return stateSchema.parse(s.state); }
