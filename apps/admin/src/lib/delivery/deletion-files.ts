import "server-only";
import { database } from "../db";
import { storageSettings } from "./storage-client";

export async function cleanupDeletedFiles(fetcher: typeof fetch = fetch) {
  if (fetcher !== fetch && process.env.NODE_ENV !== "test")
    throw new Error("Test storage transport is disabled.");
  const db = database();
  const rows = await db.deliveryDeletedFile.findMany({
    where: { notBefore: { lte: new Date() } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: 50,
  });
  if (!rows.length)
    return { removed: 0, pending: await db.deliveryDeletedFile.count() };
  let removed = 0;
  for (const bucket of ["igo-partner-logos", "igo-delivery-receipts"]) {
    const group = rows.filter((r) => r.bucket === bucket);
    if (!group.length) continue;
    try {
      if (
        group.some(
          (r) => !/^[a-f0-9-]{36}\/(?:logo|[a-f0-9-]{36})\.webp$/.test(r.path),
        )
      )
        throw new Error("Invalid private file path");
      const { origin, headers } = storageSettings();
      const response = await fetcher(`${origin}/storage/v1/object/${bucket}`, {
        method: "DELETE",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ prefixes: group.map((r) => r.path) }),
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error("Storage rejected removal");
      // Storage DELETE is idempotent. A process crash before this step is safe.
      const result = await db.deliveryDeletedFile.deleteMany({
        where: { id: { in: group.map((r) => r.id) } },
      });
      removed += result.count;
    } catch {
      await db.deliveryDeletedFile.updateMany({
        where: { id: { in: group.map((r) => r.id) } },
        data: {
          attempts: { increment: 1 },
          lastError:
            "Private file removal failed. Check server storage settings and retry.",
        },
      });
    }
  }
  return { removed, pending: await db.deliveryDeletedFile.count() };
}
