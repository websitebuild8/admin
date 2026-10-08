import { z } from 'zod';
import { MobileError } from './mobile-contract';

export const menuImageViewSchema=z.object({
  id:z.uuid(),url:z.url(),thumbnailUrl:z.url(),width:z.number().int().positive(),height:z.number().int().positive(),
}).strict();
export type MenuImageView=z.infer<typeof menuImageViewSchema>;
export type ImageOwner={kind:'restaurant'|'demo';id:string};
export type ImageAttachment={id:string;ownerKind:string;ownerId:string;state:string;attachedTo:string|null;createdAt:Date};
export function requireAttachableImage(image:ImageAttachment|null,owner:ImageOwner,itemId:string,now=new Date()) {
  if(!image || image.ownerKind!==owner.kind || image.ownerId!==owner.id)
    throw new MobileError('Food photo not found.',404);
  if(image.state==='Attached' && image.attachedTo===itemId)return;
  if(image.state!=='Ready' || image.attachedTo || image.createdAt.getTime()<now.getTime()-24*60*60*1000)
    throw new MobileError('This photo is no longer available. Choose it again.',409);
}
