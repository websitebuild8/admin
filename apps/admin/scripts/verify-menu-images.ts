import {config} from 'dotenv';
config({path:'.env.local',quiet:true});
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {randomUUID} from 'node:crypto';
import {database} from '../src/lib/db';
import {PrismaClient} from '../src/generated/prisma/client';
import {saveMenu,deleteMenu,ownMenu,catalog} from '../src/lib/mobile-service';
import {restaurantImageOwner,uploadMenuImage,reservePhoto,discardMenuImage,attachMenuImage,cleanMenuImages} from '../src/lib/menu-image-service';
import {imagePaths,uploadPhotoObject,deletePhotoObjects,photoUploadsReady} from '../src/lib/menu-image-storage';
import {MobileError} from '../src/lib/mobile-contract';
import {createSandbox} from '../src/lib/demo-sandbox';
import {hashDemoKey} from '../src/lib/demo-repository';
import {NextRequest} from 'next/server';
import {POST as demoPost,GET as demoGet} from '../src/app/api/demo/mobile/[resource]/route';

async function main(){
  const db=database(),rollback=Symbol('rollback'),marker=`photo-check-${randomUUID()}`,fetcher=globalThis.fetch;
  const globals=globalThis as unknown as {igoPrisma?:PrismaClient};
  const originals={url:process.env.SUPABASE_URL,secret:process.env.SUPABASE_SECRET_KEY,legacy:process.env.SUPABASE_SERVICE_ROLE_KEY};
  const calls:Array<{method?:string;body?:BodyInit|null}>=[];
  try {
    process.env.SUPABASE_URL='https://igo-storage-check.supabase.co';process.env.SUPABASE_SECRET_KEY='sb_secret_verification_only';delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    globalThis.fetch=async (url,options)=>{
      assert.ok(String(url).startsWith('https://igo-storage-check.supabase.co/storage/v1/object/igo-menu-images'));
      const headers=new Headers(options?.headers);assert.equal(headers.get('apikey'),process.env.SUPABASE_SECRET_KEY??process.env.SUPABASE_SERVICE_ROLE_KEY);
      assert.equal(headers.get('authorization'),process.env.SUPABASE_SECRET_KEY?null:`Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`);
      assert.equal(options?.redirect,'error');calls.push({method:options?.method,body:options?.body});
      return new Response('{}',{status:200,headers:{'content-type':'application/json'}});
    };
    const paths=imagePaths('restaurant',randomUUID(),randomUUID());
    await uploadPhotoObject(paths.path,Buffer.from([1]));
    delete process.env.SUPABASE_SECRET_KEY;process.env.SUPABASE_SERVICE_ROLE_KEY='eyJ.verification-only';
    await deletePhotoObjects([paths.path,paths.thumbnailPath]);
    assert.deepEqual(JSON.parse(calls.at(-1)!.body as string),{prefixes:[paths.path,paths.thumbnailPath]});
    const count=calls.length;await assert.rejects(()=>deletePhotoObjects(['restaurant/*']),MobileError);assert.equal(calls.length,count);
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;assert.equal(photoUploadsReady(),false);
    process.env.SUPABASE_SECRET_KEY='sb_secret_verification_only';
    await db.$transaction(async tx=>{
      // Nested service transactions use this same rollback connection. Storage
      // HTTP calls above are mocked; no real files/accounts/menu rows are kept.
      globals.igoPrisma=new Proxy(tx,{get(target,key){if(key==='$transaction')return async (work:(nested:typeof tx)=>unknown)=>work(tx);return Reflect.get(target,key);}}) as unknown as PrismaClient;
      const users=[`${marker}-owner`,`${marker}-other`,`${marker}-customer`,`${marker}-pending`],restaurants:string[]=[];
      for(let i=0;i<users.length;i++){
        const role=i===2?'customer':'restaurant';
        await tx.profile.create({data:{clerkUserId:users[i],name:marker,primaryRole:role,roles:{create:{role,status:i===3?'Pending':'Active'}}}});
        if(role==='restaurant')restaurants[i]=(await tx.restaurant.create({data:{clerkUserId:users[i],name:marker,initials:'PC',cuisine:'Food',area:'Malé',contact:'Verification',status:i===3?'Pending':'Active',documentsVerified:i!==3}})).id;
      }
      const owner=await restaurantImageOwner(users[0]),other=await restaurantImageOwner(users[1]);
      for(const user of [users[2],users[3]])await assert.rejects(()=>restaurantImageOwner(user),e=>e instanceof MobileError&&e.status===403);
      const jpeg=await sharp({create:{width:512,height:512,channels:3,background:'#ffe040'}}).jpeg().toBuffer();
      const request=()=>new Request('https://igo.example/image',{method:'POST',headers:{'content-type':'image/jpeg'},body:new Uint8Array(jpeg)});
      const uploaded=await uploadMenuImage(owner,request());assert.ok(uploaded.image);const id=uploaded.image.id;
      const fields={name:'Verification dish',description:'Fixture',category:'Food',price:2500,available:true},draftId=randomUUID();
      const first=await saveMenu(users[0],{...fields,draftId,imageId:id});assert.equal(first.id,draftId);assert.equal(first.image?.id,id);
      const replay=await saveMenu(users[0],{...fields,draftId,imageId:id});assert.equal(replay.id,first.id);assert.equal(await tx.menuItem.count({where:{id:draftId}}),1);
      const own=await ownMenu(users[0],1);assert.equal(own.items[0].image?.id,id);assert.equal('imageAsset' in own.items[0],false);assert.equal('ownerKind' in own.items[0],false);
      const customerItem=(await catalog(users[2],1,restaurants[0])).items[0];
      assert.ok('image' in customerItem);assert.equal(customerItem.image?.id,id);
      await assert.rejects(()=>saveMenu(users[1],{...fields,imageId:id}),e=>e instanceof MobileError&&e.status===404);
      await assert.rejects(()=>discardMenuImage(other,id),e=>e instanceof MobileError&&e.status===404);
      await discardMenuImage(owner,id);assert.equal((await tx.menuImage.findUniqueOrThrow({where:{id}})).state,'Attached');
      await saveMenu(users[0],{...fields,id:first.id,name:'Updated dish'});assert.equal((await ownMenu(users[0],1)).items[0].image?.id,id);
      const second=await uploadMenuImage(owner,request());await saveMenu(users[0],{...fields,id:first.id,imageId:second.image!.id});
      assert.equal((await tx.menuImage.findUniqueOrThrow({where:{id}})).state,'Deleted');
      await saveMenu(users[0],{...fields,id:first.id,imageId:null});assert.equal((await ownMenu(users[0],1)).items[0].image,null);
      const third=await uploadMenuImage(owner,request());await saveMenu(users[0],{...fields,id:first.id,imageId:third.image!.id});
      await deleteMenu(users[0],{id:first.id});assert.equal((await tx.menuImage.findUniqueOrThrow({where:{id:third.image!.id}})).state,'Deleted');
      await assert.rejects(()=>uploadMenuImage(owner,new Request('https://igo.example/image',{method:'POST',headers:{'content-type':'image/jpeg'},body:'invalid'})),MobileError);
      assert.equal(await tx.menuImage.count({where:{ownerId:owner.id,state:'Uploading'}}),0);
      const stale=await reservePhoto(owner);await tx.menuImage.update({where:{id:stale.id},data:{state:'Ready',createdAt:new Date(Date.now()-25*3600000)}});
      const key=`igo_demo_${randomUUID().replaceAll('-','')}${randomUUID().replaceAll('-','')}`;
      const demo=await tx.demoSession.create({data:{ownerClerkId:marker,keyHash:hashDemoKey(key),expiresAt:new Date(Date.now()+3600000),payload:createSandbox()}});
      const context=(resource:string)=>({params:Promise.resolve({resource})});
      async function writeDemo(resource:string,input:unknown,role='restaurant') {
        const response=await demoPost(new NextRequest(`https://igo.example/api/demo/mobile/${resource}`,{method:'POST',headers:{authorization:`Bearer ${key}`,'x-igo-demo-role':role,'content-type':resource==='menu-image'?'image/jpeg':'application/json'},body:resource==='menu-image'?new Uint8Array(jpeg):JSON.stringify(input)}),context(resource));
        const result=await response.json();assert.equal(response.status,200,result.error);return result;
      }
      const demoPhoto=await writeDemo('menu-image',null),demoDraft=randomUUID();
      await writeDemo('menu',{...fields,draftId:demoDraft,imageId:demoPhoto.image.id});
      const read=await demoGet(new NextRequest(`https://igo.example/api/demo/mobile/catalog?restaurantId=8b004daa-4616-4f93-a83d-000000000002`,{headers:{authorization:`Bearer ${key}`,'x-igo-demo-role':'customer'}}),context('catalog'));
      const viewed=await read.json();assert.equal(viewed.restaurant.acceptingOrders,true);assert.equal(viewed.items.find((m:{id:string})=>m.id===demoDraft).image.id,demoPhoto.image.id);
      assert.equal((await writeDemo('availability',{online:true})).photoUploadsEnabled,true);
      await writeDemo('menu',{...fields,id:demoDraft,imageId:null});
      assert.equal((await tx.menuImage.findUniqueOrThrow({where:{id:demoPhoto.image.id}})).state,'Deleted');
      const demoOwner={kind:'demo' as const,id:demo.id},asset=await reservePhoto(demoOwner),demoItem=randomUUID();
      await tx.menuImage.update({where:{id:asset.id},data:{state:'Ready',width:512,height:512}});
      await assert.rejects(()=>attachMenuImage(tx,owner,randomUUID(),asset.id,null),e=>e instanceof MobileError&&e.status===404);
      await attachMenuImage(tx,demoOwner,demoItem,asset.id,null);
      await cleanMenuImages();assert.equal((await tx.menuImage.findUniqueOrThrow({where:{id:stale.id}})).state,'Deleted');
      assert.equal((await tx.menuImage.findUniqueOrThrow({where:{id:asset.id}})).state,'Deleted');
      for(let i=0;i<10;i++)await reservePhoto(other);
      await assert.rejects(()=>reservePhoto(other),e=>e instanceof MobileError&&e.status===429);
      const bucket=await tx.$queryRaw<Array<{public:boolean;file_size_limit:bigint;allowed_mime_types:string[]}>>`SELECT public,file_size_limit,allowed_mime_types FROM storage.buckets WHERE id='igo-menu-images'`;
      assert.equal(bucket[0].public,true);assert.deepEqual(bucket[0].allowed_mime_types,['image/webp']);
      const policies=await tx.$queryRaw<Array<{policyname:string;permissive:string}>>`SELECT policyname,permissive FROM pg_policies WHERE schemaname='storage' AND policyname LIKE 'igo_menu_images_%'`;
      assert.equal(policies.length,2);assert.ok(policies.every(p=>p.permissive==='RESTRICTIVE'));
      const security=await tx.$queryRaw<Array<{relrowsecurity:boolean;anon:boolean;authenticated:boolean}>>`SELECT relrowsecurity,has_table_privilege('anon','"MenuImage"','SELECT') AS anon,has_table_privilege('authenticated','"MenuImage"','INSERT') AS authenticated FROM pg_class WHERE relname='MenuImage'`;
      assert.equal(security[0].relrowsecurity,true);assert.equal(security[0].anon,false);assert.equal(security[0].authenticated,false);
      throw rollback;
    },{maxWait:15000,timeout:90000});
  }catch(error){if(error!==rollback)throw error;}
  finally{
    globalThis.fetch=fetcher;globals.igoPrisma=db;
    for(const [key,value] of Object.entries({SUPABASE_URL:originals.url,SUPABASE_SECRET_KEY:originals.secret,SUPABASE_SERVICE_ROLE_KEY:originals.legacy}))if(value===undefined)delete process.env[key];else process.env[key]=value;
    await db.$disconnect();
  }
  console.log('PASS: approved owner access, photo processing, atomic attach/replace/remove/delete, create retries, foreign/demo isolation, quotas, cleanup and bucket security. Database fixtures rolled back; Storage HTTP mocked.');
}
main().catch(error=>{console.error('Photo verification failed.',{name:error?.name,code:error?.code,message:error?.name==='AssertionError'?error.message:undefined});process.exitCode=1;});
