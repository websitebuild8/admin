import sharp from 'sharp';
import { MobileError } from './mobile-contract';

export const maximumPhotoBytes = 3 * 1024 * 1024;
export const maximumPhotoPixels = 16 * 1024 * 1024;
let processing=false;
const waiting:Array<()=>void>=[];
async function acquireProcessor() {
  if(!processing){processing=true;return;}
  if(waiting.length>=3)throw new MobileError('Photo editing is busy. Please retry shortly.',429);
  await new Promise<void>(resolve=>waiting.push(resolve));
}
function releaseProcessor() {const next=waiting.shift();if(next)next();else processing=false;}
const acceptedTypes = new Set(['image/jpeg','image/png','image/webp']);

// Bound native image processing work per process. No originals or EXIF/GPS
// metadata are stored; the only published bytes are re-encoded still WebP.
sharp.concurrency(1);
sharp.cache({memory:16,files:0,items:16});

export async function photoBody(request:Request) {
  const type = request.headers.get('content-type')?.split(';')[0].trim() ?? '';
  if (!acceptedTypes.has(type)) throw new MobileError('Choose a JPEG, PNG or WebP food photo.',415);
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > maximumPhotoBytes) throw new MobileError('Choose a photo smaller than 3 MB.',413);
  const reader=request.body?.getReader();
  if (!reader) throw new MobileError('Choose a food photo.');
  const chunks:Uint8Array[]=[];let length=0;
  try {
    while(true) {
      const {done,value}=await reader.read();if(done)break;
      length+=value.byteLength;
      if(length>maximumPhotoBytes) {await reader.cancel();throw new MobileError('Choose a photo smaller than 3 MB.',413);}
      chunks.push(value);
    }
  } finally {reader.releaseLock();}
  if(!length) throw new MobileError('Choose a food photo.');
  return {bytes:Buffer.concat(chunks),type};
}

export async function prepareMenuPhoto(bytes:Buffer,type:string) {
  if (!acceptedTypes.has(type) || bytes.length>maximumPhotoBytes || !bytes.length)
    throw new MobileError('Choose a JPEG, PNG or WebP food photo under 3 MB.',415);
  await acquireProcessor();
  try {
    const metadata = await sharp(bytes,{limitInputPixels:maximumPhotoPixels,failOn:'error'}).metadata();
    if (!['jpeg','png','webp'].includes(metadata.format??'') || (metadata.pages??1)!==1
        || !metadata.width || !metadata.height || metadata.width<128 || metadata.height<128)
      throw new Error('Unsupported image');
    const side=Math.min(metadata.width,metadata.height);
    const rotated=(metadata.orientation??1)>=5 && (metadata.orientation??1)<=8;
    const width=rotated?metadata.height:metadata.width,height=rotated?metadata.width:metadata.height;
    const cover=await sharp(bytes,{limitInputPixels:maximumPhotoPixels,failOn:'error'})
      .autoOrient().extract({left:Math.floor((width-side)/2),top:Math.floor((height-side)/2),width:side,height:side})
      .resize(1024,1024,{fit:'cover',withoutEnlargement:true})
      .flatten({background:'#ffffff'}).toColourspace('srgb').webp({quality:82,effort:3}).toBuffer({resolveWithObject:true});
    const thumbnail=await sharp(cover.data).resize(256,256,{fit:'cover',withoutEnlargement:true})
      .webp({quality:76,effort:3}).toBuffer();
    return {cover:cover.data,thumbnail,width:cover.info.width,height:cover.info.height};
  } catch {throw new MobileError('Use a clear still JPEG, PNG or WebP photo, at least 128 pixels wide and high.');}
  finally {releaseProcessor();}
}
