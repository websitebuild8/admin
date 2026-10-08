import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { cleanMenuImages } from '@/lib/menu-image-service';
import { storageSettings } from '@/lib/menu-image-storage';
export const runtime='nodejs';
export async function GET(request:NextRequest) {
  const supplied=Buffer.from(request.headers.get('authorization')??''),secret=process.env.CRON_SECRET;
  const expected=Buffer.from(`Bearer ${secret??''}`);
  if(!secret || supplied.length!==expected.length || !timingSafeEqual(supplied,expected))
    return NextResponse.json({error:'Unauthorized'},{status:403});
  try {
    storageSettings();
    return NextResponse.json(await cleanMenuImages(),{headers:{'Cache-Control':'no-store'}});
  }catch {return NextResponse.json({error:'Photo cleanup could not finish. Retry later.'},{status:503});}
}
