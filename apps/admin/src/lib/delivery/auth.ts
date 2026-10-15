import "server-only";
import { auth } from "@clerk/nextjs/server";
import { database } from "../db";
import { hasClerkKeys } from "../mode";
import { DeliveryError, type Actor } from "./domain";

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
  const account = await database().deliveryAccount.findUnique({
    where: { clerkUserId: userId },
    include: { partner: true },
  });
  return account
    ? {
        userId,
        id: account.id,
        role: account.role,
        partnerId: account.partner?.id ?? null,
        status: account.status,
        name: account.name,
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
