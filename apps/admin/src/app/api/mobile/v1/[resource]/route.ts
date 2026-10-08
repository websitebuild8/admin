import { NextRequest } from 'next/server';
import { mobileUser,mobileOptions,mobileResponse,body } from '@/lib/mobile-http';
import { account,register,saveAddress,catalog,ownMenu,saveMenu,deleteMenu,menuStock,availability,quote,checkout,support,acceptPolicies,pageNumber } from '@/lib/mobile-service';
import { z } from 'zod';
import { uploadMenuImage, restaurantImageOwner, discardMenuImage } from '@/lib/menu-image-service';
import { parse } from '@/lib/mobile-service';
import { MobileError } from '@/lib/mobile-contract';
import { lookupPlace } from '@/lib/places-service';
export const runtime='nodejs';
export const maxDuration=60;
type Context={params:Promise<{resource:string}>};
export const OPTIONS=mobileOptions;
export async function GET(request:NextRequest,context:Context) {
  return mobileResponse(request,async()=>{
    const user=await mobileUser(request),{resource}=await context.params;
    if(resource==='account') return account(user);
    if(resource==='catalog') return catalog(user,pageNumber(request.nextUrl.searchParams.get('page')),request.nextUrl.searchParams.get('restaurantId'),request.nextUrl.searchParams.get('q')??'',request.nextUrl.searchParams.get('cuisine')??'All',request.nextUrl.searchParams.get('category')??'All');
    if(resource==='menu') return ownMenu(user,pageNumber(request.nextUrl.searchParams.get('page')),request.nextUrl.searchParams.get('stock')??'All',request.nextUrl.searchParams.get('q')??'');
    throw new MobileError('Not found.',404);
  });
}
export async function POST(request:NextRequest,context:Context) {
  return mobileResponse(request,async()=>{
    const user=await mobileUser(request),{resource}=await context.params;
    if(resource==='menu-image')return uploadMenuImage(await restaurantImageOwner(user),request);
    const input=await body(request);
    if(resource==='image-discard')return discardMenuImage(await restaurantImageOwner(user),parse(z.object({id:z.uuid()}).strict(),input).id);
    if(resource==='places') return lookupPlace(user,input);
    if(resource==='register') return register(user,input);
    if(resource==='policies') return acceptPolicies(user,input);
    if(resource==='address') return saveAddress(user,input);
    if(resource==='menu') return saveMenu(user,input);
    if(resource==='menu-delete') return deleteMenu(user,input);
    if(resource==='menu-stock') return menuStock(user,input);
    if(resource==='availability') return availability(user,input);
    if(resource==='quote') return quote(user,input);
    if(resource==='checkout') return checkout(user,input);
    if(resource==='support') return support(user,input);
    throw new MobileError('Not found.',404);
  });
}
