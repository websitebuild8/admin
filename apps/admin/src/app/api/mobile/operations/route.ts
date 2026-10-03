import { NextRequest } from 'next/server';
import { participant } from '@/lib/participant-auth';
import { mutate } from '@/lib/repository';
import { commandSchema, stateSchema, WorkflowError } from '@/lib/domain';
import { orderView } from '@/lib/workflow';
import { database } from '@/lib/db';
import { mobileUser,mobileResponse,mobileOptions,body } from '@/lib/mobile-http';
import { MobileError } from '@/lib/mobile-contract';
import { pageNumber } from '@/lib/mobile-service';
export const runtime = 'nodejs';
export const OPTIONS=mobileOptions;
export async function GET(request:NextRequest) {
  return mobileResponse(request,async()=>{
    const {principal}=await participant(await mobileUser(request));const db=database();
    const page=pageNumber(request.nextUrl.searchParams.get('page'));
    const where=principal.role==='customer'?{customerId:principal.id}:principal.role==='restaurant'?{restaurantId:principal.id}:{riderId:principal.id};
    const [orders,total,notices,offerOrders]=await Promise.all([
      db.order.findMany({where,orderBy:[{time:'desc'},{id:'desc'}],skip:(page-1)*10,take:10}),db.order.count({where}),
      db.notification.findMany({where:{recipient:`${principal.role}:${principal.id}`},orderBy:{time:'desc'},take:10}),
      principal.role==='rider'?db.order.findMany({where:{riderId:null,paid:true,status:{in:['Preparing','Ready for pickup']},workflow:{path:['offers'],array_contains:[{riderId:principal.id}]}},orderBy:{time:'desc'},take:100}):[],
    ]);
    const restaurants=await db.restaurant.findMany({where:{id:{in:[...orders,...offerOrders].map(o=>o.restaurantId)}}});
    const riders=await db.rider.findMany({where:{id:{in:orders.flatMap(o=>o.riderId?[o.riderId]:[])}}});
    const state=stateSchema.parse({orders:orders.map(o=>({...o,time:o.time.toISOString(),workflow:o.workflow??undefined})),restaurants,riders,tickets:[],refunds:[],activity:[],settings:{businessName:'iGO',supportEmail:'',deliveryFee:2500,maleEnabled:true,hulhumaleEnabled:true}});
    const now=Date.now();
    const offers=principal.role==='rider'?offerOrders.flatMap(o=>{
      const workflow=stateSchema.shape.orders.element.parse({...o,time:o.time.toISOString(),workflow:o.workflow??undefined}).workflow;
      return workflow.offers.filter(f=>f.riderId===principal.id&&Date.parse(f.expiresAt)>now).map(f=>({orderId:o.id,publicId:o.publicId??o.id,restaurant:restaurants.find(r=>r.id===o.restaurantId)?.name,area:restaurants.find(r=>r.id===o.restaurantId)?.area,items:o.items,expiresAt:f.expiresAt}));
    }).slice(0,10):[];
    return {role:principal.role,orders:state.orders.map(o=>orderView(state,o,principal)),offers,notifications:notices.map(({id,orderId,text,time})=>({id,orderId,text,time})),page,pageSize:10,total};
  });
}
export async function POST(request:NextRequest) {
  return mobileResponse(request,async()=>{
    const identity=await participant(await mobileUser(request));let raw:unknown=await body(request);
    // The rider identity comes from its approved account, never from request JSON.
    if(raw && typeof raw==='object' && 'type' in raw && raw.type==='accept-offer') raw={...raw,riderId:identity.principal.id};
    const command=commandSchema.safeParse(raw);
    if(!command.success || !['preparation','delivery','accept-offer'].includes(command.data.type)) throw new MobileError('Invalid mobile action.');
    try {await mutate(command.data,identity.actor,identity.principal);return {ok:true};}
    catch(e){throw new MobileError(e instanceof WorkflowError?e.message:'Another update was made. Refresh and retry.',409);}
  });
}
