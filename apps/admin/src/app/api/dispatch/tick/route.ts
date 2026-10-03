import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { isDemoMode } from '@/lib/mode';
import { readState, mutate } from '@/lib/repository';
export const runtime = 'nodejs';
export async function GET(request: NextRequest) {
  const expected = `Bearer ${process.env.CRON_SECRET ?? ''}`;
  const supplied = request.headers.get('authorization') ?? '';
  if (isDemoMode() || !process.env.CRON_SECRET || supplied.length !== expected.length || !timingSafeEqual(Buffer.from(supplied),Buffer.from(expected))) return NextResponse.json({error:'Unauthorized'},{status:403});
  const state = await readState();
  let advanced = 0;
  for (const order of state.orders.filter(o => o.paid && !o.riderId && ['Preparing','Ready for pickup'].includes(o.status) && o.workflow.wave < 3 && !o.workflow.offers.some(f => Date.parse(f.expiresAt) > Date.now())).slice(0,20)) {
    try { await mutate({type:'dispatch',id:order.id},'Dispatch scheduler'); advanced++; } catch { /* A concurrent assignment or tick won; next tick rechecks. */ }
  }
  return NextResponse.json({advanced});
}
