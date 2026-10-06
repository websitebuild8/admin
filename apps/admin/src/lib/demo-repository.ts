import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { Prisma } from '@/generated/prisma/client';
import { database } from './db';
import { MobileError } from './mobile-contract';
import { createSandbox, sandboxSchema, type Sandbox } from './demo-sandbox';

const lifeMs=7*24*60*60*1000;
const newKey=()=>`igo_demo_${randomBytes(32).toString('hex')}`;
export const hashDemoKey=(key:string)=>createHash('sha256').update(key).digest('hex');
function json(s:Sandbox) {return JSON.parse(JSON.stringify(s)) as Prisma.InputJsonValue;}
export async function listDemoSessions(owner:string) {
  return database().demoSession.findMany({where:{ownerClerkId:owner,expiresAt:{gt:new Date()}},select:{id:true,createdAt:true,expiresAt:true},orderBy:{createdAt:'desc'},take:10});
}
export async function createDemoSession(owner:string) {
  const key=newKey(),expiresAt=new Date(Date.now()+lifeMs);
  return database().$transaction(async tx=>{
    // Bound retained storage and active sessions; simultaneous creations cannot
    // race the per-owner limit in this serializable transaction.
    await tx.demoSession.deleteMany({where:{ownerClerkId:owner,expiresAt:{lte:new Date()}}});
    if(await tx.demoSession.count({where:{ownerClerkId:owner}})>=10) throw new MobileError('End an old demo session before creating another.',409);
    const session=await tx.demoSession.create({data:{ownerClerkId:owner,keyHash:hashDemoKey(key),expiresAt,payload:json(createSandbox())}});
    return {id:session.id,key,expiresAt};
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
}
type Change<T>={sandbox?:Sandbox;result:T};
// Row locks serialize gateway decisions, menu edits and dispatch acceptance on
// one demo session. Only this single sandbox row can be read or written here.
async function withSession<T>(id:string,authorized:(s:{ownerClerkId:string;keyHash:string})=>boolean,work:(s:Sandbox)=>Change<T>|Promise<Change<T>>) {
  return database().$transaction(async tx=>{
    await tx.$queryRaw`SELECT "id" FROM "DemoSession" WHERE "id" = ${id} FOR UPDATE`;
    const row=await tx.demoSession.findUnique({where:{id}});
    if(!row||!authorized(row)||row.expiresAt.getTime()<=Date.now()) throw new MobileError('Demo session expired or access was removed. Ask your admin for a new session.',401);
    const {sandbox,result}=await work(sandboxSchema.parse(row.payload));
    if(sandbox) await tx.demoSession.update({where:{id},data:{payload:json(sandbox)}});
    return result;
  },{timeout:15000});
}
export async function withDemoKey<T>(key:string,work:(s:Sandbox)=>Change<T>|Promise<Change<T>>) {
  if(!/^igo_demo_[a-f0-9]{64}$/.test(key)) throw new MobileError('A valid demo session key is required.',401);
  const hash=hashDemoKey(key),row=await database().demoSession.findUnique({where:{keyHash:hash},select:{id:true}});
  if(!row) throw new MobileError('Demo session expired or access was removed.',401);
  return withSession(row.id,s=>s.keyHash===hash,work);
}
export async function withDemoOwner<T>(id:string,owner:string,work:(s:Sandbox)=>Change<T>|Promise<Change<T>>) {
  return withSession(id,s=>s.ownerClerkId===owner,work);
}
export async function rotateDemoKey(id:string,owner:string) {
  const key=newKey();
  const result=await database().demoSession.updateMany({where:{id,ownerClerkId:owner,expiresAt:{gt:new Date()}},data:{keyHash:hashDemoKey(key)}});
  if(!result.count) throw new MobileError('Demo session not found.',404);
  return {id,key};
}
export async function endDemoSession(id:string,owner:string) {
  const result=await database().demoSession.deleteMany({where:{id,ownerClerkId:owner}});
  if(!result.count) throw new MobileError('Demo session not found.',404);
  return {ok:true};
}
