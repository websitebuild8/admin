import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { mutate } from '@/lib/repository';
import { commandSchema, WorkflowError } from '@/lib/domain';
export const runtime = 'nodejs';
export async function POST(request: NextRequest) {
  if (request.headers.get('origin') !== request.nextUrl.origin) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  let actor: string;
  try { actor = await requireAdmin(); } catch { return NextResponse.json({ error: 'Administrator access required.' }, { status: 403 }); }
  const parsed = commandSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request. Check all required fields.' }, { status: 400 });
  try { return NextResponse.json(await mutate(parsed.data, actor)); }
  catch (e) {
    return NextResponse.json({ error: e instanceof WorkflowError ? e.message : 'The change could not be saved. Refresh and try again.' }, { status: 409 });
  }
}
