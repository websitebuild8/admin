import 'server-only';
import { auth } from '@clerk/nextjs/server';
import { hasClerkKeys, isDemoMode } from './mode';

export async function requireAdmin() {
  if (isDemoMode()) throw new Error('Live data is disabled in demo mode.');
  if (!hasClerkKeys()) throw new Error('Clerk is not configured.');
  const { userId } = await auth();
  const allowed = (process.env.ADMIN_CLERK_USER_IDS ?? '').split(',').map(s => s.trim()).filter(Boolean);
  if (!userId || !allowed.includes(userId)) throw new Error('Administrator access required.');
  return userId;
}
