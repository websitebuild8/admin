import "server-only";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { database } from "../db";
import { hasClerkKeys } from "../mode";
import { DeliveryError, type Actor } from "./domain";
import { activateApprovedPartner } from "./partner-applications";
import { verifiedPrimaryEmail } from "./partner-application-input";

export async function deliveryActor(): Promise<Actor> {
  if (!hasClerkKeys())
    throw new DeliveryError("Clerk authentication is not configured.", 503);
  const { userId } = await auth();
  if (!userId) throw new DeliveryError("Please sign in.", 401);
  const admins = (process.env.ADMIN_CLERK_USER_IDS ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  if (admins.includes(userId))
    return {
      userId,
      role: "ADMIN",
      id: null,
      partnerId: null,
      name: "Administrator",
      status: "APPROVED",
    };
  let account = await database().deliveryAccount.findUnique({
    where: { clerkUserId: userId },
    include: {
      partner: { include: { application: { select: { logoReady: true } } } },
    },
  });
  if (!account) {
    const user = await (await clerkClient()).users.getUser(userId);
    const email = verifiedPrimaryEmail(user);
    if (email && (await activateApprovedPartner(userId, email)))
      account = await database().deliveryAccount.findUnique({
        where: { clerkUserId: userId },
        include: {
          partner: {
            include: { application: { select: { logoReady: true } } },
          },
        },
      });
  }
  return account
    ? {
        userId,
        id: account.id,
        role: account.role,
        partnerId: account.partner?.id ?? null,
        status: account.status,
        name: account.name,
        businessName: account.partner?.businessName,
        logoAvailable: account.partner?.application?.logoReady ?? false,
      }
    : {
        userId,
        id: null,
        role: "APPLICANT",
        partnerId: null,
        status: "UNREGISTERED",
        name: "Welcome",
      };
}
