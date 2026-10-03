import 'server-only';
import { auth } from '@clerk/nextjs/server';
import { database } from './db';
import { isDemoMode, hasClerkKeys } from './mode';
import type { Principal } from './fulfilment';
export async function participant(): Promise<{ actor: string; principal: Principal }> {
  if (isDemoMode() || !hasClerkKeys()) throw new Error('Unavailable');
  const { userId } = await auth();
  if (!userId) throw new Error('Sign in required');
  const db = database();
  const [rider, restaurant, profile] = await Promise.all([db.rider.findUnique({where:{clerkUserId:userId}}),db.restaurant.findUnique({where:{clerkUserId:userId}}),db.profile.findUnique({where:{clerkUserId:userId},include:{roles:true}})]);
  // Bindings and approvals are provisioned by trusted onboarding, never client metadata.
  const approved = (role: string) => profile?.roles.some(r => r.role === role && r.status === 'Active');
  if (rider?.status === 'Active' && rider.documentsVerified && approved('rider')) return {actor:userId,principal:{role:'rider',id:rider.id}};
  if (restaurant?.status === 'Active' && restaurant.documentsVerified && approved('restaurant')) return {actor:userId,principal:{role:'restaurant',id:restaurant.id}};
  if (profile) return {actor:userId,principal:{role:'customer',id:profile.id}};
  throw new Error('No approved account');
}
