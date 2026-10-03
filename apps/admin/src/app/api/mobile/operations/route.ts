import { NextRequest, NextResponse } from 'next/server';
import { participant } from '@/lib/participant-auth';
import { readState, mutate } from '@/lib/repository';
import { commandSchema, WorkflowError } from '@/lib/domain';
import { orderView } from '@/lib/workflow';
import { database } from '@/lib/db';
export const runtime = 'nodejs';
export async function GET() {
  try {
    const {principal} = await participant();
    const state = await readState();
    const orders = state.orders.filter(o => principal.role === 'customer' ? o.customerId === principal.id : principal.role === 'restaurant' ? o.restaurantId === principal.id : o.riderId === principal.id);
    const offers = principal.role === 'rider' ? state.orders.filter(o => !o.riderId).flatMap(o => o.workflow.offers.filter(f => f.riderId === principal.id && Date.parse(f.expiresAt) > Date.now()).map(f => ({orderId:o.id,restaurant:state.restaurants.find(r => r.id === o.restaurantId)?.name,expiresAt:f.expiresAt,distanceKm:f.distanceKm}))) : [];
    const notifications = await database().notification.findMany({where:{recipient:`${principal.role}:${principal.id}`},orderBy:{time:'desc'},take:100});
    return NextResponse.json({role:principal.role,orders:orders.map(o => orderView(state,o,principal)),offers,notifications:notifications.map(({id,orderId,text,time})=>({id,orderId,text,time}))},{headers:{'Cache-Control':'no-store'}});
  } catch { return NextResponse.json({error:'Access unavailable.'},{status:403}); }
}
export async function POST(request: NextRequest) {
  // Browser cookies require same-origin; native callers must carry a Clerk bearer token.
  const origin = request.headers.get('origin');
  if (origin ? origin !== request.nextUrl.origin : !request.headers.get('authorization')?.startsWith('Bearer ')) return NextResponse.json({error:'Invalid origin or missing bearer token.'},{status:403});
  let identity;
  try { identity = await participant(); } catch { return NextResponse.json({error:'Access unavailable.'},{status:403}); }
  const command = commandSchema.safeParse(await request.json().catch(()=>null));
  if (!command.success) return NextResponse.json({error:'Invalid action.'},{status:400});
  try { await mutate(command.data,identity.actor,identity.principal); return NextResponse.json({ok:true}); }
  catch(e) { return NextResponse.json({error:e instanceof WorkflowError ? e.message : 'Update conflicted. Refresh and retry.'},{status:409}); }
}
