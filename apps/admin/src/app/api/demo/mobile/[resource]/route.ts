import { NextRequest } from 'next/server';
import { mobileRole, MobileError } from '@/lib/mobile-contract';
import { allowedMobileOrigins, body, mobileOptions, mobileResponse } from '@/lib/mobile-http';
import { demoRead, demoWrite } from '@/lib/demo-sandbox';
import { withDemoKey } from '@/lib/demo-repository';

export const runtime='nodejs';
export const OPTIONS=mobileOptions;
function identity(request:NextRequest) {
  const origin=request.headers.get('origin');
  if(origin&&origin!==request.nextUrl.origin&&!allowedMobileOrigins().includes(origin)) throw new MobileError('This app origin is not allowed.',403);
  const role=mobileRole.safeParse(request.headers.get('x-igo-demo-role'));
  if(!role.success) throw new MobileError('Choose a fictional demo role.');
  const key=request.headers.get('authorization')?.match(/^Bearer (igo_demo_[a-f0-9]{64})$/)?.[1];
  if(!key) throw new MobileError('A demo session key is required.',401);
  return {key,role:role.data};
}
type Context={params:Promise<{resource:string}>};
export async function GET(request:NextRequest,context:Context) {
  return mobileResponse(request,async()=>{
    const {key,role}=identity(request),{resource}=await context.params;
    const query=Object.fromEntries(request.nextUrl.searchParams);
    return withDemoKey(key,s=>({result:demoRead(s,role,resource,query)}));
  });
}
export async function POST(request:NextRequest,context:Context) {
  return mobileResponse(request,async()=>{
    const {key,role}=identity(request),{resource}=await context.params,raw=await body(request);
    return withDemoKey(key,s=>demoWrite(s,role,resource,raw));
  });
}
