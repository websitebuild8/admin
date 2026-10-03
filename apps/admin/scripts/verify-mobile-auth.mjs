import {config} from 'dotenv';
import assert from 'node:assert/strict';
import {createClerkClient} from '@clerk/backend';
config({path:'.env.local',quiet:true});
if(!process.env.CLERK_SECRET_KEY?.startsWith('sk_test_'))throw new Error('Development instance required.');
const client=createClerkClient({secretKey:process.env.CLERK_SECRET_KEY});
const base='http://localhost:3000';let session;
try {
 const anonymous=await fetch(`${base}/api/mobile/v1/account`);assert.equal(anonymous.status,401);assert.match(anonymous.headers.get('content-type'),/application\/json/);
 const forged=await fetch(`${base}/api/mobile/v1/account`,{headers:{Authorization:'Bearer forged.token.value'}});assert.equal(forged.status,401);
 const denied=await fetch(`${base}/api/mobile/v1/account`,{method:'OPTIONS',headers:{Origin:'https://untrusted.example'}});assert.equal(denied.status,403);
 const policy=await fetch(`${base}/legal/privacy`);assert.equal(policy.status,200);
 session=await client.sessions.createSession({userId:process.env.ADMIN_CLERK_USER_IDS.split(',')[0].trim()});
 const {jwt}=await client.sessions.getToken(session.id);
 const account=await fetch(`${base}/api/mobile/v1/account`,{headers:{Authorization:`Bearer ${jwt}`}});assert.equal(account.status,200);
 const payload=await account.json();assert.equal(payload.paymentsEnabled,false);assert.equal(payload.access,null);
 const operations=await fetch(`${base}/api/mobile/operations`,{headers:{Authorization:`Bearer ${jwt}`}});assert.equal(operations.status,403);
 console.log('PASS: anonymous/forged-token rejection, CORS rejection, public policy access, verified native-style bearer session and no role without registration.');
}finally{if(session)await client.sessions.revokeSession(session.id);console.log('Temporary verification session revoked.');}
