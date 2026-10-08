import 'server-only';
import { randomUUID } from 'node:crypto';
import { attachMenuImage, queuePhotoDelete, flushPhotoDeletes, menuImageView } from './menu-image-service';
import { photoUploadsReady } from './menu-image-storage';
import { Prisma } from '@/generated/prisma/client';
import { z } from 'zod';
import { database } from './db';
import { participant } from './participant-auth';
import { verifiedIdentity } from './mobile-http';
import { verifyGoogleAddress } from './places-service';
import { addressInput, registrationInput, menuInput, menuDeleteInput, menuStockInput, quoteInput, MobileError, policyVersion, policiesReady, requireCurrentPolicies, approvedPrincipal, addressLabel } from './mobile-contract';

export function parse<T extends z.ZodType>(schema:T,input:unknown):z.infer<T> {
  const result=schema.safeParse(input);
  if(!result.success) throw new MobileError(result.error.issues[0]?.message ?? 'Invalid input.');
  return result.data;
}
export function pageNumber(raw:string|null) {
  const n=Number(raw??1);
  if(!Number.isInteger(n)||n<1||n>10000) throw new MobileError('Invalid page.');
  return n;
}
const initials=(name:string)=>name.split(/\s+/).map(s=>s[0]).slice(0,2).join('').toUpperCase();
export async function account(userId:string) {
  const db=database();
  const [profile,restaurant,rider]=await Promise.all([
    db.profile.findUnique({where:{clerkUserId:userId},include:{roles:true,addresses:true,consents:{where:{version:policyVersion()}}}}),
    db.restaurant.findUnique({where:{clerkUserId:userId}}),db.rider.findUnique({where:{clerkUserId:userId}}),
  ]);
  return {
    registered:!!profile?.primaryRole, name:profile?.name??'', role:profile?.primaryRole??null,
    status:profile?.roles.find(r=>r.role===profile.primaryRole)?.status??null,
    access:profile ? approvedPrincipal(profile,restaurant,rider) : null,
    addresses:profile?.addresses.filter(a=>!a.google || Date.parse((a.google as {expiresAt:string}).expiresAt)>Date.now()).map(({id,kind,area,building,unit,instructions,latitude,longitude,google})=>({id,kind,area,building,unit,instructions,latitude,longitude,google}))??[],
    restaurant:restaurant ? {id:restaurant.id,name:restaurant.name,area:restaurant.area,acceptingOrders:restaurant.acceptingOrders,pickup:restaurant.pickupAddress,pendingPickup:restaurant.pendingPickupAddress} : null,
    rider:rider ? {id:rider.id,area:rider.area,online:rider.online} : null,
    policy:{version:policyVersion(),published:policiesReady(),accepted:!!profile?.consents.length,links:['/legal/terms','/legal/privacy','/legal/refunds','/legal/partners']},
    paymentsEnabled:false,photoUploadsEnabled:photoUploadsReady(),
  };
}
export async function register(userId:string,input:unknown) {
  const v=parse(registrationInput,input); requireCurrentPolicies(v.policyVersion);
  if(v.pickup) verifyGoogleAddress(userId,v.pickup);
  await verifiedIdentity(userId);
  const db=database();
  await db.$transaction(async tx=>{
    const existing=await tx.profile.findUnique({where:{clerkUserId:userId}});
    if(existing?.primaryRole) {
      if(existing.primaryRole!==v.role) throw new MobileError('Your account already has a role. Contact support to change it.',409);
      return;
    }
    const profile=await tx.profile.upsert({where:{clerkUserId:userId},create:{clerkUserId:userId,name:v.name,phone:v.phone,primaryRole:v.role},update:{name:v.name,phone:v.phone,primaryRole:v.role}});
    await tx.roleApplication.create({data:{profileId:profile.id,role:v.role,status:v.role==='customer'?'Active':'Pending',details:{area:v.area,...(v.vehicle?{vehicle:v.vehicle}:{})}}});
    await tx.policyAcceptance.create({data:{profileId:profile.id,version:v.policyVersion}});
    if(v.role==='restaurant') await tx.restaurant.create({data:{clerkUserId:userId,name:v.businessName!,initials:initials(v.businessName!),cuisine:v.cuisine||'Restaurant',area:v.area,contact:v.phone,pendingPickupAddress:v.pickup!}});
    if(v.role==='rider') await tx.rider.create({data:{clerkUserId:userId,name:v.name,initials:initials(v.name),area:v.area,phone:v.phone}});
    await tx.auditEvent.create({data:{text:`${v.role} registration received`,actor:userId}});
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
  return account(userId);
}
export async function acceptPolicies(userId:string,input:unknown) {
  const v=parse(z.object({version:z.string(),accepted:z.literal(true)}).strict(),input);requireCurrentPolicies(v.version);
  const p=await database().profile.findUnique({where:{clerkUserId:userId}});
  if(!p) throw new MobileError('Complete registration first.',403);
  await database().policyAcceptance.upsert({where:{profileId_version:{profileId:p.id,version:v.version}},create:{profileId:p.id,version:v.version},update:{}});
  return account(userId);
}
export async function saveAddress(userId:string,input:unknown) {
  const address=parse(addressInput,input);
  verifyGoogleAddress(userId,address);
  const db=database();const profile=await db.profile.findUnique({where:{clerkUserId:userId}});
  if(!profile || !['customer','restaurant'].includes(profile.primaryRole??'')) throw new MobileError('Address access unavailable.',403);
  // Pending restaurants may correct their application; only admin can activate the entrance.
  return db.$transaction(async tx=>{
    if(profile.primaryRole==='restaurant') {
      await tx.restaurant.update({where:{clerkUserId:userId},data:{pendingPickupAddress:address}});
      await tx.auditEvent.create({data:{text:'Restaurant pickup entrance submitted for review',actor:userId}});
    }
    const kind=profile.primaryRole==='customer'?'delivery':'pickup';
    const data={...address,google:address.google??Prisma.DbNull};
    return tx.savedAddress.upsert({where:{profileId_kind:{profileId:profile.id,kind}},create:{profileId:profile.id,kind,...data},update:data});
  });
}
export async function catalog(userId:string,page:number,restaurantId:string|null,q='',cuisine='All',category='All') {
  await participant(userId);const db=database();
  if(category.length>60) throw new MobileError('Invalid menu category.');
  const filter=parse(z.object({q:z.string().trim().max(100),cuisine:z.enum(['All','Coffee','Maldivian','Pizza'])}),{q,cuisine});
  if(restaurantId) {
    if(!z.uuid().safeParse(restaurantId).success) throw new MobileError('Invalid restaurant.');
    const restaurant=await db.restaurant.findFirst({where:{id:restaurantId,status:'Active',documentsVerified:true}});
    if(!restaurant) throw new MobileError('Restaurant unavailable.',404);
    const where={restaurantId,available:true,...(category!=='All'?{category}:{})};
    const [items,total]=await Promise.all([db.menuItem.findMany({where,orderBy:[{name:'asc'},{id:'asc'}],skip:(page-1)*10,take:10,include:{imageAsset:true}}),db.menuItem.count({where})]);
    const categories=await db.menuItem.groupBy({by:['category'],where:{restaurantId,available:true},orderBy:{category:'asc'}});
    return {items:items.map(menuView),total,page,pageSize:10,categories:categories.map(c=>c.category),restaurant:{id:restaurant.id,name:restaurant.name,acceptingOrders:restaurant.acceptingOrders,area:restaurant.area}};
  }
  const where:Prisma.RestaurantWhereInput={status:'Active',documentsVerified:true,pickupAddress:{not:Prisma.DbNull},
    ...(filter.cuisine==='All'?{}:{cuisine:{contains:filter.cuisine,mode:'insensitive'}}),
    ...(filter.q?{OR:[{name:{contains:filter.q,mode:'insensitive'}},{cuisine:{contains:filter.q,mode:'insensitive'}},
      {menu:{some:{available:true,name:{contains:filter.q,mode:'insensitive'}}}}]}:{})};
  const [items,total]=await Promise.all([db.restaurant.findMany({where,orderBy:[{name:'asc'},{id:'asc'}],skip:(page-1)*10,take:10,select:{id:true,name:true,cuisine:true,area:true,prepTime:true,acceptingOrders:true}}),db.restaurant.count({where})]);
  return {items,total,page,pageSize:10};
}
function menuView(item:Prisma.MenuItemGetPayload<{include:{imageAsset:true}}>) {
  return {id:item.id,name:item.name,description:item.description,category:item.category,price:item.price,available:item.available,image:menuImageView(item.imageAsset)};
}
export async function ownMenu(userId:string,page:number,stock='All',q='') {
  const {principal}=await participant(userId); if(principal.role!=='restaurant') throw new MobileError('Restaurant access required.',403);
  if(!['All','Available','Out of stock'].includes(stock) || q.length>100) throw new MobileError('Invalid menu filter.');
  const where={restaurantId:principal.id,...(stock==='All'?{}:{available:stock==='Available'}),...(q.trim()?{name:{contains:q.trim(),mode:'insensitive' as const}}:{})};const db=database();
  const [items,total,availableCount,itemCount]=await Promise.all([
    db.menuItem.findMany({where,orderBy:[{category:'asc'},{name:'asc'},{id:'asc'}],skip:(page-1)*10,take:10,include:{imageAsset:true}}),db.menuItem.count({where}),
    db.menuItem.count({where:{restaurantId:principal.id,available:true}}),db.menuItem.count({where:{restaurantId:principal.id}})]);
  return {items:items.map(menuView),total,page,pageSize:10,availableCount,itemCount};
}
export async function deleteMenu(userId:string,input:unknown) {
  const {id}=parse(menuDeleteInput,input),{principal}=await participant(userId);
  if(principal.role!=='restaurant') throw new MobileError('Restaurant access required.',403);
  // Orders and quotes retain their existing JSON snapshots. Checkout must recheck
  // menu availability before any future gateway capture is implemented.
  const owner={kind:'restaurant' as const,id:principal.id};
  await database().$transaction(async tx=>{
    await tx.$queryRaw`SELECT "id" FROM "Restaurant" WHERE "id"=${principal.id} FOR UPDATE`;
    const item=await tx.menuItem.findFirst({where:{id,restaurantId:principal.id}});
    if(!item)throw new MobileError('Menu item not found.',404);
    await tx.menuItem.delete({where:{id}});
    if(item.imageId)await queuePhotoDelete(tx,owner,item.imageId);
  });
  await flushPhotoDeletes(owner).catch(()=>{});
  return {ok:true};
}
export async function menuStock(userId:string,input:unknown) {
  const {id,available}=parse(menuStockInput,input),{principal}=await participant(userId);
  if(principal.role!=='restaurant') throw new MobileError('Restaurant access required.',403);
  const result=await database().menuItem.updateMany({where:{id,restaurantId:principal.id},data:{available}});
  if(!result.count) throw new MobileError('Menu item not found.',404);
  return {ok:true};
}
export async function saveMenu(userId:string,input:unknown) {
  const v=parse(menuInput,input);const {principal}=await participant(userId);
  if(principal.role!=='restaurant') throw new MobileError('Restaurant access required.',403);
  const {id,draftId,imageId,...data}=v,owner={kind:'restaurant' as const,id:principal.id};
  const result=await database().$transaction(async tx=>{
    // Serializes creation retries and changes to this restaurant's menu.
    await tx.$queryRaw`SELECT "id" FROM "Restaurant" WHERE "id"=${principal.id} FOR UPDATE`;
    const target=id??draftId??randomUUID();
    const old=await tx.menuItem.findUnique({where:{id:target}});
    if(old && old.restaurantId!==principal.id || id && !old)throw new MobileError('Menu item not found.',404);
    const nextImage=imageId===undefined?old?.imageId??null:imageId;
    if(imageId!==undefined)await attachMenuImage(tx,owner,target,nextImage,old?.imageId??null);
    const item=old
      ? await tx.menuItem.update({where:{id:target},data:{...data,imageId:nextImage},include:{imageAsset:true}})
      : await tx.menuItem.create({data:{id:target,...data,imageId:nextImage,restaurantId:principal.id},include:{imageAsset:true}});
    return menuView(item);
  });
  await flushPhotoDeletes(owner).catch(()=>{});
  return result;
}
export async function availability(userId:string,input:unknown) {
  const v=parse(z.object({online:z.boolean(),area:z.enum(['Malé','Hulhumalé']).optional()}).strict(),input);
  const {principal}=await participant(userId);const db=database();
  if(principal.role==='restaurant') {
    const r=await db.restaurant.findUniqueOrThrow({where:{id:principal.id}});
    if(v.online && (!r.pickupAddress || !await db.menuItem.count({where:{restaurantId:r.id,available:true}}))) throw new MobileError('Approve your entrance and add available menu items before opening.');
    await db.restaurant.update({where:{id:principal.id},data:{acceptingOrders:v.online}});
  } else if(principal.role==='rider') {
    await db.$transaction(async tx=>{
      const active=await tx.order.count({where:{riderId:principal.id,status:{not:'Delivered'}}});
      if(active && (!v.online || v.area)) throw new MobileError('Finish your active delivery before changing availability or service area.');
      await tx.rider.update({where:{id:principal.id},data:{online:v.online,...(v.area?{area:v.area}:{})}});
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
  } else throw new MobileError('Partner access required.',403);
  return account(userId);
}
export async function quote(userId:string,input:unknown) {
  const v=parse(quoteInput,input);const {principal,profile}=await participant(userId);
  if(principal.role!=='customer') throw new MobileError('Customer access required.',403);
  // Prices, availability, fee and consent come from the server. No client total or paid flag.
  return database().$transaction(async tx=>{
    if(!await tx.policyAcceptance.count({where:{profileId:profile.id,version:policyVersion()}})) throw new MobileError('Review the current policies first.',409);
    const [restaurant,address,settings,menu]=await Promise.all([
      tx.restaurant.findUnique({where:{id:v.restaurantId}}),tx.savedAddress.findFirst({where:{id:v.addressId,profileId:profile.id,kind:'delivery'}}),
      tx.serviceSettings.findUnique({where:{id:'default'}}),tx.menuItem.findMany({where:{id:{in:v.items.map(i=>i.id)},restaurantId:v.restaurantId,available:true}}),
    ]);
    if(!restaurant||restaurant.status!=='Active'||!restaurant.documentsVerified||!restaurant.acceptingOrders||!restaurant.pickupAddress) throw new MobileError('Restaurant is not taking orders.',409);
    if(!address) throw new MobileError('Save your delivery entrance first.');
    if(menu.length!==v.items.length) throw new MobileError('Menu availability changed. Refresh your cart.',409);
    const pickup=parse(addressInput,restaurant.pickupAddress),destination=parse(addressInput,{area:address.area,building:address.building,unit:address.unit,instructions:address.instructions,latitude:address.latitude,longitude:address.longitude,...(address.google?{google:address.google}:{})});
    for(const a of [pickup,destination]) if(a.google && Date.parse(a.google.expiresAt)<=Date.now()) throw new MobileError('Refresh the saved entrance before ordering.',409);
    for(const a of [pickup.area,destination.area]) if(settings && !(a==='Malé'?settings.maleEnabled:settings.hulhumaleEnabled)) throw new MobileError('This service area is currently closed.',409);
    const lineItems=v.items.map(i=>{const item=menu.find(m=>m.id===i.id)!;return {id:item.id,name:item.name,unitPrice:item.price,quantity:i.quantity};});
    const subtotal=lineItems.reduce((sum,i)=>sum+i.unitPrice*i.quantity,0),deliveryFee=settings?.deliveryFee??2500;
    const snapshot={customer:profile.name,restaurant:restaurant.name,pickup,destination,address:addressLabel(destination),lineItems,note:v.note,subtotal,deliveryFee,policyVersion:policyVersion()};
    const q=await tx.checkoutQuote.create({data:{customerId:profile.id,restaurantId:restaurant.id,snapshot,amount:subtotal+deliveryFee,expiresAt:new Date(Date.now()+15*60000)}});
    return {id:q.id,amount:q.amount,currency:q.currency,expiresAt:q.expiresAt,snapshot,paymentsEnabled:false};
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
}
export async function checkout(userId:string,input:unknown) {
  const {quoteId}=parse(z.object({quoteId:z.uuid()}).strict(),input);const {principal}=await participant(userId);
  if(principal.role!=='customer') throw new MobileError('Customer access required.',403);
  const q=await database().checkoutQuote.findFirst({where:{id:quoteId,customerId:principal.id}});
  if(!q) throw new MobileError('Checkout not found.',404);
  if(q.expiresAt.getTime()<Date.now()) throw new MobileError('Quote expired. Refresh your cart.',409);
  // Fail closed until the bank's merchant contract and sandbox response verification
  // are confirmed. Redirect parameters can never create an order or mark it paid.
  throw new MobileError('Card checkout opens after BML merchant setup is complete. No payment has been collected.',503);
}
export async function support(userId:string,input:unknown) {
  const v=parse(z.object({orderId:z.string().max(100),subject:z.string().trim().min(10).max(500)}).strict(),input);
  const {principal,profile}=await participant(userId);if(principal.role!=='customer') throw new MobileError('Customer access required.',403);
  const db=database();const order=await db.order.findFirst({where:{id:v.orderId,customerId:principal.id}});
  if(!order) throw new MobileError('Order unavailable.',404);
  if(await db.supportCase.count({where:{orderId:order.id,status:'Open'}})) throw new MobileError('An open support case already exists for this order.',409);
  return db.supportCase.create({data:{orderId:order.id,customer:profile.name,subject:v.subject}});
}
