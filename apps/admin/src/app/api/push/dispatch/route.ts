import { dispatchRiderPush } from "@/lib/delivery/push";
import { json } from "@/lib/delivery/http";
import { validPushScheduler } from "@/lib/delivery/push-scheduler";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  const secret = process.env.PUSH_CRON_SECRET;
  if (!secret || secret.length < 32)
    return json(
      { error: "Push scheduler authentication is not configured." },
      503,
    );
  if (!validPushScheduler(request.headers, secret))
    return json({ error: "Not authorized." }, 401);
  try {
    return json(await dispatchRiderPush());
  } catch {
    return json(
      { error: "Push dispatch failed; queued work is retained for retry." },
      503,
    );
  }
}
