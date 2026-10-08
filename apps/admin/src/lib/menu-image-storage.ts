import 'server-only';
import { z } from 'zod';
import { MobileError } from './mobile-contract';

export const menuImageBucket='igo-menu-images';
function storageOrigin() {
  let url:URL;
  try {url=new URL(process.env.SUPABASE_URL??'');}catch {throw new MobileError('Food photo uploads are not connected yet.',503);}
  if(url.protocol!=='https:' || !/^[a-z0-9-]+\.supabase\.co$/.test(url.hostname)
      || url.username || url.password || url.search || url.hash || !['','/'].includes(url.pathname))
    throw new MobileError('Food photo uploads are not connected yet.',503);
  return url.origin;
}
export function storageSettings() {
  const origin=storageOrigin();
  const key=process.env.SUPABASE_SECRET_KEY?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if(!key || !(key.startsWith('sb_secret_') || key.startsWith('eyJ')))
    throw new MobileError('Food photo uploads are not connected yet.',503);
  // New secret keys are not JWTs. Send them only as apikey; legacy service-role
  // JWTs also work with the Storage API's Authorization header.
  const headers:Record<string,string>={apikey:key};
  if(!key.startsWith('sb_secret_'))headers.Authorization=`Bearer ${key}`;
  return {origin,headers};
}
export function photoUploadsReady() {try {storageSettings();return true;}catch{return false;}}
export function imagePaths(kind:'restaurant'|'demo',owner:string,id:string) {
  if (!z.uuid().safeParse(owner).success || !z.uuid().safeParse(id).success)
    throw new MobileError('Invalid food photo reference.');
  const folder=`${kind}/${owner}/${id}`;
  return {path:`${folder}/cover.webp`,thumbnailPath:`${folder}/thumbnail.webp`};
}
function safePath(path:string) {
  if(!/^(restaurant|demo)\/[a-f0-9-]{36}\/[a-f0-9-]{36}\/(cover|thumbnail)\.webp$/.test(path))
    throw new MobileError('Invalid food photo reference.');
  return path;
}
export function imagePublicUrl(path:string) {
  const origin=storageOrigin();
  return `${origin}/storage/v1/object/public/${menuImageBucket}/${safePath(path)}`;
}
export async function uploadPhotoObject(path:string,bytes:Buffer,fetcher:typeof fetch=fetch) {
  const {origin,headers}=storageSettings();
  try {
    const response=await fetcher(`${origin}/storage/v1/object/${menuImageBucket}/${safePath(path)}`,{
      method:'POST',headers:{...headers,'Content-Type':'image/webp','Cache-Control':'max-age=3600','x-upsert':'false'},
      body:new Uint8Array(bytes),signal:AbortSignal.timeout(8000),redirect:'error',cache:'no-store',
    });
    if(!response.ok) throw new Error('Storage rejected upload');
  }catch {throw new MobileError('Could not upload the food photo. Please retry.',503);}
}
export async function deletePhotoObjects(paths:string[],fetcher:typeof fetch=fetch) {
  if(!paths.length)return;
  const {origin,headers}=storageSettings();
  try {
    const response=await fetcher(`${origin}/storage/v1/object/${menuImageBucket}`,{
      method:'DELETE',headers:{...headers,'Content-Type':'application/json'},
      body:JSON.stringify({prefixes:paths.map(safePath)}),signal:AbortSignal.timeout(8000),redirect:'error',cache:'no-store',
    });
    if(!response.ok) throw new Error('Storage rejected removal');
  }catch {throw new MobileError('Food photo removal is queued. Please retry later.',503);}
}
