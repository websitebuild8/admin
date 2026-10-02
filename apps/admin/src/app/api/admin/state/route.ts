import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { readState } from '@/lib/repository';
export const runtime = 'nodejs';
export async function GET() {
  try { await requireAdmin(); } catch { return NextResponse.json({ error: 'Administrator access required.' }, { status: 403 }); }
  try { return NextResponse.json(await readState(), { headers: { 'Cache-Control': 'no-store' } }); }
  catch { return NextResponse.json({ error: 'Database unavailable. Check connection and migrations.' }, { status: 503 }); }
}
