import { NextRequest } from 'next/server';
import { mobileUser,mobileOptions,mobileResponse,body } from '@/lib/mobile-http';
import { account,register,saveAddress,catalog,ownMenu,saveMenu,availability,quote,checkout,support,acceptPolicies,pageNumber } from '@/lib/mobile-service';
import { MobileError } from '@/lib/mobile-contract';
export const runtime='nodejs';
type Context={params:Promise<{resource:string}>};
export const OPTIONS=mobileOptions;
export async function GET(request:NextRequest,context:Context) {
  return mobileResponse(request,async()=>{
    const user=await mobileUser(request),{resource}=await context.params;
    if(resource==='account') return account(user);
    if(resource==='catalog') return catalog(user,pageNumber(request.nextUrl.searchParams.get('page')),request.nextUrl.searchParams.get('restaurantId'));
    if(resource==='menu') return ownMenu(user,pageNumber(request.nextUrl.searchParams.get('page')));
    throw new MobileError('Not found.',404);
  });
}
export async function POST(request:NextRequest,context:Context) {
  return mobileResponse(request,async()=>{
    const user=await mobileUser(request),{resource}=await context.params,input=await body(request);
    if(resource==='register') return register(user,input);
    if(resource==='policies') return acceptPolicies(user,input);
    if(resource==='address') return saveAddress(user,input);
    if(resource==='menu') return saveMenu(user,input);
    if(resource==='availability') return availability(user,input);
    if(resource==='quote') return quote(user,input);
    if(resource==='checkout') return checkout(user,input);
    if(resource==='support') return support(user,input);
    throw new MobileError('Not found.',404);
  });
}
