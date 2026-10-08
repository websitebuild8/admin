import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { photoUploadsReady } from '@/lib/menu-image-storage';
import { parse } from '@/lib/mobile-service';
import { menuInput, menuDeleteInput } from '@/lib/mobile-contract';
import { attachMenuImage, uploadMenuImage, discardMenuImage, menuImageView, queuePhotoDelete, flushPhotoDeletes } from '@/lib/menu-image-service';
import { NextRequest } from 'next/server';
import { mobileRole, MobileError } from '@/lib/mobile-contract';
import { allowedMobileOrigins, body, mobileOptions, mobileResponse } from '@/lib/mobile-http';
import { demoRead, demoWrite } from '@/lib/demo-sandbox';
import { withDemoKey } from '@/lib/demo-repository';

export const runtime='nodejs';
export const maxDuration=60;
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
    return withDemoKey(key,s=>{
      const result=demoRead(s,role,resource,query);
      return {result:resource==='account'?{...(result as object),photoUploadsEnabled:photoUploadsReady()}:result};
    });
  });
}
export async function POST(request:NextRequest,context:Context) {
  return mobileResponse(request,async()=>{
    const {key,role}=identity(request),{resource}=await context.params;
    if(resource==='menu-image'||resource==='image-discard') {
      const owner=await withDemoKey(key,(s,c)=>{
        demoRead(s,role,'menu'); // Enforces approved fictional restaurant access.
        return {result:{kind:'demo' as const,id:c.id}};
      });
      if(resource==='menu-image')return uploadMenuImage(owner,request);
      const {id}=parse(z.object({id:z.uuid()}).strict(),await body(request));
      return discardMenuImage(owner,id);
    }
    const raw=await body(request);
    let imageOwner:{kind:'demo';id:string}|undefined;
    const result=await withDemoKey(key,async(s,c)=>{
      if(resource!=='menu'&&resource!=='menu-delete')return demoWrite(s,role,resource,raw);
      demoRead(s,role,'menu');
      const owner={kind:'demo' as const,id:c.id};
      imageOwner=owner;
      if(resource==='menu-delete') {
        const v=parse(menuDeleteInput,raw),item=s.menu.find(m=>m.id===v.id);
        const change=demoWrite(s,role,resource,raw);
        if(item?.image)await queuePhotoDelete(c.tx,owner,item.image.id);
        return change;
      }
      const v=parse(menuInput,raw),target=v.id??v.draftId??randomUUID(),old=s.menu.find(m=>m.id===target);
      if(v.id&&!old)throw new MobileError('Demo menu item not found.',404);
      // Validate limits before attaching. All image and JSON updates commit together.
      if(!old&&s.menu.length>=100)throw new MobileError('Demo menu limit reached.',409);
      let image=old?.image??null;
      if(v.imageId!==undefined) {
        await attachMenuImage(c.tx,owner,target,v.imageId,old?.image?.id??null);
        image=v.imageId?menuImageView(await c.tx.menuImage.findUnique({where:{id:v.imageId}})):null;
      }
      return demoWrite(s,role,resource,{...v,...(v.id?{}:{draftId:target})},undefined,{image});
    });
    // File removal may be retried later without undoing a committed menu edit.
    if(imageOwner)await flushPhotoDeletes(imageOwner).catch(()=>{});
    return resource==='availability'?{...(result as object),photoUploadsEnabled:photoUploadsReady()}:result;
  });
}
