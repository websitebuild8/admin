import 'server-only';
import { createClerkClient, verifyToken } from '@clerk/backend';
import { NextRequest, NextResponse } from 'next/server';
import { MobileError } from './mobile-contract';
import { isDemoMode } from './mode';

export function allowedMobileOrigins() {
  return (process.env.MOBILE_ALLOWED_ORIGINS ?? (process.env.NODE_ENV === 'development' ? 'http://localhost:8080,http://127.0.0.1:8080' : ''))
    .split(',').map(s=>s.trim()).filter(Boolean);
}
function headers(request:NextRequest) {
  const origin=request.headers.get('origin');
  return {
    'Cache-Control':'no-store', 'Vary':'Origin',
    ...(origin && allowedMobileOrigins().includes(origin) ? {'Access-Control-Allow-Origin':origin} : {}),
    'Access-Control-Allow-Methods':'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers':'Authorization,Content-Type',
  };
}
export function mobileOptions(request:NextRequest) {
  const origin=request.headers.get('origin');
  return new NextResponse(null,{status:origin && !allowedMobileOrigins().includes(origin) ? 403 : 204,headers:headers(request)});
}
export async function mobileUser(request:NextRequest) {
  if (isDemoMode() || !process.env.CLERK_SECRET_KEY) throw new MobileError('Mobile access is not configured.',503);
  const origin=request.headers.get('origin');
  if (origin && origin !== request.nextUrl.origin && !allowedMobileOrigins().includes(origin)) throw new MobileError('This app origin is not allowed.',403);
  const bearer=request.headers.get('authorization')?.match(/^Bearer ([^\s]+)$/)?.[1];
  if (!bearer) throw new MobileError('Sign in to continue.',401);
  try {
    // SDK verifies signature, issuer, expiry and session-token type. Never decode
    // an unverified token or accept a client-supplied Clerk user/role identifier.
    const token=await verifyToken(bearer,{secretKey:process.env.CLERK_SECRET_KEY});
    // Native session tokens have no browser azp. Check it when present, after
    // signature verification, rather than rejecting every native session.
    if (token.azp && ![request.nextUrl.origin,...allowedMobileOrigins()].includes(token.azp)) throw new Error('Unexpected authorized party');
    if (!token.sub || !token.sid || token.sts === 'pending') throw new Error('Inactive session');
    return token.sub;
  } catch { throw new MobileError('Your session expired. Sign in again.',401); }
}
export async function verifiedIdentity(userId:string) {
  const user=await createClerkClient({secretKey:process.env.CLERK_SECRET_KEY}).users.getUser(userId);
  const email=user.emailAddresses.find(e=>e.id === user.primaryEmailAddressId);
  if (email?.verification?.status !== 'verified') throw new MobileError('Verify your primary email in Clerk before registration.',403);
  return user;
}
export async function body(request:NextRequest) {
  // Reject large/streamed payloads before parsing; uploads use a separate private
  // storage flow rather than accepting documents or card details as JSON.
  const reader=request.body?.getReader();
  if (!reader) throw new MobileError('Missing request body.');
  const chunks:Uint8Array[]=[]; let size=0;
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>16384){await reader.cancel();throw new MobileError('Request too large.',413);}chunks.push(value);}
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new MobileError('Invalid request body.'); }
}
export async function mobileResponse(request:NextRequest, work:()=>Promise<unknown>) {
  try {return NextResponse.json(await work(),{headers:headers(request)});}
  catch(error){
    const status=error instanceof MobileError ? error.status : 500;
    return NextResponse.json({error:error instanceof MobileError ? error.message : 'Could not complete this request. Please retry.'},{status,headers:headers(request)});
  }
}
