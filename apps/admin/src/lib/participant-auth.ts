import 'server-only';
import { database } from './db';
import { approvedPrincipal, MobileError } from './mobile-contract';
export async function participant(userId:string) {
  const db=database();
  const [profile,restaurant,rider]=await Promise.all([
    db.profile.findUnique({where:{clerkUserId:userId},include:{roles:true}}),
    db.restaurant.findUnique({where:{clerkUserId:userId}}),
    db.rider.findUnique({where:{clerkUserId:userId}}),
  ]);
  const principal=profile && approvedPrincipal(profile,restaurant,rider);
  if(!principal) throw new MobileError('Your account is awaiting approval or is not active.',403);
  return {actor:userId,principal,profile:profile!};
}
