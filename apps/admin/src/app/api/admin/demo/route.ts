import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';
import { body, mobileResponse } from '@/lib/mobile-http';
import { MobileError } from '@/lib/mobile-contract';
import { createSandbox, demoAdminCommand } from '@/lib/demo-sandbox';
import { createDemoSession, listDemoSessions, withDemoOwner, rotateDemoKey, endDemoSession } from '@/lib/demo-repository';

export const runtime='nodejs';
async function owner() {try{return await requireAdmin();}catch{throw new MobileError('Approved administrator access required for shared demos.',403);}}
function summary(id:string,s:ReturnType<typeof createSandbox>) {
  return {id,state:s.state,payments:s.attempts.map(a=>({...a,amount:s.quotes.find(q=>q.id===a.quoteId)?.amount})).reverse()};
}
export async function GET(request:NextRequest) {
  return mobileResponse(request,async()=>{
    const actor=await owner(),id=request.nextUrl.searchParams.get('id');
    if(!id) return {sessions:await listDemoSessions(actor)};
    if(!z.uuid().safeParse(id).success) throw new MobileError('Invalid demo session.');
    return withDemoOwner(id,actor,s=>({result:summary(id,s)}));
  });
}
const actions=z.discriminatedUnion('action',[
  z.object({action:z.literal('create')}).strict(),
  z.object({action:z.enum(['reset','rotate','end']),id:z.uuid()}).strict(),
  z.object({action:z.literal('command'),id:z.uuid(),command:z.unknown()}).strict(),
]);
export async function POST(request:NextRequest) {
  return mobileResponse(request,async()=>{
    if(request.headers.get('origin')!==request.nextUrl.origin) throw new MobileError('Invalid request origin.',403);
    const actor=await owner(),value=actions.safeParse(await body(request));
    if(!value.success) throw new MobileError('Invalid demo session action.');
    const v=value.data;
    if(v.action==='create') return createDemoSession(actor);
    if(v.action==='rotate') return rotateDemoKey(v.id,actor);
    if(v.action==='end') return endDemoSession(v.id,actor);
    return withDemoOwner(v.id,actor,s=>{
      const sandbox=v.action==='command'?demoAdminCommand(s,v.command):createSandbox();
      return {sandbox,result:summary(v.id,sandbox)};
    });
  });
}
