import {config} from 'dotenv';
config({path:'.env.local',quiet:true});
import assert from 'node:assert/strict';
import {database} from '../src/lib/db';
import {PrismaClient} from '../src/generated/prisma/client';
import {saveMenu,menuStock,deleteMenu,ownMenu,catalog} from '../src/lib/mobile-service';
import {MobileError} from '../src/lib/mobile-contract';

async function main(){
  const db=database(), rollback=Symbol('rollback'), marker=`menu-verification-${crypto.randomUUID()}`;
  const globals=globalThis as unknown as {igoPrisma?:PrismaClient};
  await db.$queryRaw`SELECT 1`;
  try {
    await db.$transaction(async tx=>{
      // All service calls in this process share the rollback transaction. No
      // Clerk calls, actual accounts or externally visible records are created.
      globals.igoPrisma=tx as unknown as PrismaClient;
      const users=[`${marker}-owner`,`${marker}-other`,`${marker}-customer`,`${marker}-pending`];
      const restaurants:string[]=[];
      for(let i=0;i<users.length;i++){
        const role=i===2?'customer':'restaurant';
        await tx.profile.create({data:{clerkUserId:users[i],name:marker,primaryRole:role,
          roles:{create:{role,status:i===3?'Pending':'Active'}}}});
        if(role==='restaurant'){
          const r=await tx.restaurant.create({data:{clerkUserId:users[i],name:marker,initials:'MV',cuisine:'Coffee',
            area:'Malé',contact:'Verification',status:i===3?'Pending':'Active',documentsVerified:i!==3}});
          restaurants[i]=r.id;
        }
      }
      const item=await saveMenu(users[0],{name:'Verification coffee',description:'Test',category:'Drinks',price:2575,available:true});
      assert.ok('id' in item);const id=(item as {id:string}).id;
      await assert.rejects(()=>menuStock(users[1],{id,available:false}),e=>e instanceof MobileError&&e.status===404);
      await assert.rejects(()=>deleteMenu(users[1],{id}),e=>e instanceof MobileError&&e.status===404);
      await assert.rejects(()=>deleteMenu(users[2],{id}),e=>e instanceof MobileError&&e.status===403);
      await assert.rejects(()=>deleteMenu(users[3],{id}),e=>e instanceof MobileError&&e.status===403);
      const order=await tx.order.create({data:{customerId:users[2],customer:marker,restaurantId:restaurants[0],items:'Verification coffee × 1',
        amount:2575,area:'Malé',address:'Verification',paymentRef:marker,lineItems:[{id,name:'Verification coffee',unitPrice:2575,quantity:1}]}});
      await menuStock(users[0],{id,available:false});
      assert.equal((await ownMenu(users[0],1,'Out of stock')).total,1);
      assert.equal((await catalog(users[2],1,restaurants[0])).total,0);
      await saveMenu(users[0],{id,name:'Verification iced coffee',description:'New description',category:'Drinks',price:3000,available:true});
      const listed=await catalog(users[2],1,restaurants[0],'','All','Drinks');
      assert.equal(listed.total,1);assert.deepEqual(listed.categories,['Drinks']);
      await deleteMenu(users[0],{id});
      assert.equal((await ownMenu(users[0],1)).total,0);
      assert.deepEqual((await tx.order.findUniqueOrThrow({where:{id:order.id}})).lineItems,
        [{id,name:'Verification coffee',unitPrice:2575,quantity:1}]);
      throw rollback;
    },{maxWait:15000,timeout:60000});
  } catch(error){if(error!==rollback)throw error;}
  finally{globals.igoPrisma=db;await db.$disconnect();}
  console.log('PASS: menu create/edit/stock/delete, owner isolation, customer/pending denial, category filtering and preserved order snapshots. All fixtures rolled back.');
}
main().catch(error=>{console.error('Menu verification failed.',{name:error?.name,code:error?.code});process.exitCode=1;});
