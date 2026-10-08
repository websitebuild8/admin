import 'server-only';
import { randomUUID } from 'node:crypto';
import { Prisma, type MenuImage } from '@/generated/prisma/client';
import { database } from './db';
import { MobileError } from './mobile-contract';
import { participant } from './participant-auth';
import { prepareMenuPhoto, photoBody } from './menu-image-processing';
import { imagePaths, imagePublicUrl, uploadPhotoObject, deletePhotoObjects, storageSettings } from './menu-image-storage';
import { requireAttachableImage, type ImageOwner } from './menu-image-contract';

export async function restaurantImageOwner(userId:string):Promise<ImageOwner> {
  const {principal}=await participant(userId);
  if(principal.role!=='restaurant') throw new MobileError('Restaurant access required.',403);
  return {kind:'restaurant',id:principal.id};
}
export function menuImageView(image:MenuImage|null) {
  if(!image || image.state!=='Attached' && image.state!=='Ready')return null;
  try {return {id:image.id,url:imagePublicUrl(image.path),thumbnailUrl:imagePublicUrl(image.thumbnailPath),width:image.width,height:image.height};}
  catch {return null;}
}

export async function reservePhoto(owner:ImageOwner) {
  const db=database(),now=new Date(),id=randomUUID();
  return db.$transaction(async tx=>{
    // One owner row serializes quota checks and reservations across instances.
    if(owner.kind==='restaurant') {
      await tx.$queryRaw`SELECT "id" FROM "Restaurant" WHERE "id"=${owner.id} FOR UPDATE`;
      const r=await tx.restaurant.findUnique({where:{id:owner.id}});
      if(!r || r.status!=='Active' || !r.documentsVerified)throw new MobileError('Restaurant access required.',403);
    }else {
      await tx.$queryRaw`SELECT "id" FROM "DemoSession" WHERE "id"=${owner.id} FOR UPDATE`;
      const session=await tx.demoSession.findUnique({where:{id:owner.id}});
      if(!session || session.expiresAt<=now)throw new MobileError('Demo session expired.',401);
    }
    const where={ownerKind:owner.kind,ownerId:owner.id};
    const hour=await tx.menuImage.count({where:{...where,createdAt:{gte:new Date(now.getTime()-60*60000)}}});
    const day=await tx.menuImage.count({where:{...where,createdAt:{gte:new Date(now.getTime()-24*60*60000)}}});
    const pending=await tx.menuImage.count({where:{...where,state:{in:['Uploading','Ready']}}});
    if(hour>=20 || day>=100)throw new MobileError('Photo upload limit reached. Please try again later.',429);
    if(pending>=10)throw new MobileError('Save or discard an unfinished photo before uploading another.',429);
    return tx.menuImage.create({data:{id,ownerKind:owner.kind,ownerId:owner.id,...imagePaths(owner.kind,owner.id,id)}});
  });
}

export async function uploadMenuImage(owner:ImageOwner,request:Request) {
  storageSettings();
  // Reserve before decoding: malformed uploads count towards the same quota.
  const image=await reservePhoto(owner);
  try {
    const input=await photoBody(request),prepared=await prepareMenuPhoto(input.bytes,input.type);
    await uploadPhotoObject(image.path,prepared.cover);
    await uploadPhotoObject(image.thumbnailPath,prepared.thumbnail);
    const result=await database().menuImage.update({where:{id:image.id},data:{state:'Ready',width:prepared.width,height:prepared.height,bytes:prepared.cover.length+prepared.thumbnail.length}});
    return {image:menuImageView(result)};
  }catch(error) {
    await database().menuImage.update({where:{id:image.id},data:{state:'Deleting'}});
    // The database queue survives a failed/partial Storage call.
    await flushPhotoDeletes(owner,1).catch(()=>{});
    throw error;
  }
}

export async function attachMenuImage(tx:Prisma.TransactionClient,owner:ImageOwner,itemId:string,id:string|null,oldId:string|null) {
  if(id) {
    await tx.$queryRaw`SELECT "id" FROM "MenuImage" WHERE "id"=${id} FOR UPDATE`;
    const image=await tx.menuImage.findUnique({where:{id}});
    requireAttachableImage(image,owner,itemId);
    await tx.menuImage.update({where:{id},data:{state:'Attached',attachedTo:itemId}});
  }
  if(oldId && oldId!==id)await queuePhotoDelete(tx,owner,oldId);
}
export async function queuePhotoDelete(tx:Prisma.TransactionClient,owner:ImageOwner,id:string) {
  await tx.menuImage.updateMany({where:{id,ownerKind:owner.kind,ownerId:owner.id},data:{state:'Deleting',attachedTo:null}});
}
export async function discardMenuImage(owner:ImageOwner,id:string) {
  const image=await database().menuImage.findFirst({where:{id,ownerKind:owner.kind,ownerId:owner.id}});
  if(!image)throw new MobileError('Food photo not found.',404);
  // A timed-out save may already have committed. Never discard an attached photo.
  await database().menuImage.updateMany({where:{id,state:'Ready',attachedTo:null},data:{state:'Deleting'}});
  await flushPhotoDeletes(owner,1).catch(()=>{});
  return {ok:true};
}
export async function flushPhotoDeletes(owner?:ImageOwner,limit=30) {
  const db=database();
  const images=await db.menuImage.findMany({where:{state:'Deleting',...(owner?{ownerKind:owner.kind,ownerId:owner.id}:{})},orderBy:{updatedAt:'asc'},take:Math.min(limit,30)});
  if(!images.length)return {removed:0};
  await deletePhotoObjects(images.flatMap(image=>[image.path,image.thumbnailPath]));
  const result=await db.menuImage.updateMany({where:{id:{in:images.map(i=>i.id)},state:'Deleting'},data:{state:'Deleted'}});
  return {removed:result.count};
}
export async function cleanMenuImages() {
  const db=database(),now=new Date();
  // Claim stale unlinked images atomically. Attachment uses the same row lock
  // and state checks, so a collector cannot delete a newly attached photo.
  await db.menuImage.updateMany({where:{OR:[
    {state:'Ready',createdAt:{lt:new Date(now.getTime()-24*60*60000)},attachedTo:null},
    {state:'Uploading',updatedAt:{lt:new Date(now.getTime()-30*60000)}},
  ]},data:{state:'Deleting'}});
  await db.$executeRaw`
    UPDATE "MenuImage" i SET "state"='Deleting',"attachedTo"=NULL,"updatedAt"=NOW()
    WHERE i."ownerKind"='demo' AND i."state"='Attached' AND NOT EXISTS (
      SELECT 1 FROM "DemoSession" d WHERE d.id=i."ownerId" AND d."expiresAt">NOW()
      AND EXISTS(SELECT 1 FROM jsonb_array_elements(d.payload->'menu') m WHERE m->'image'->>'id'=i.id)
    )`;
  const result=await flushPhotoDeletes();
  // Retain attempts longer than the daily quota window, including failed ones.
  await db.menuImage.deleteMany({where:{state:'Deleted',createdAt:{lt:new Date(now.getTime()-48*60*60000)},menuItem:null}});
  return result;
}
