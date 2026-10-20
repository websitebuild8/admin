import { z } from "zod";
import {
  adminAccessInput,
  manageAdministrator,
} from "@/lib/delivery/admin-access";
import { assertAdministrator } from "@/lib/delivery/admin-authorization";
import { requireSuperAdmin } from "@/lib/delivery/admin-policy";
import {
  deletionInput,
  deletionTarget,
} from "@/lib/delivery/deletion-contract";
import { deleteDeliveryData, previewDeletion } from "@/lib/delivery/deletion";
import { cleanupDeletedFiles } from "@/lib/delivery/deletion-files";
import {
  workspaceProfiles,
  updateWorkspaceProfile,
} from "@/lib/delivery/workspace-profiles";
import { workspaceProfileInput } from "@/lib/delivery/workspace-profile-input";
import { revalidatePath, revalidateTag } from "next/cache";
import { NextResponse, after } from "next/server";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { workspaceFromRequest } from "@/lib/delivery/workspace-contract";
import { deliveryActor } from "@/lib/delivery/auth";
import { deliveryQuery } from "@/lib/delivery/queries";
import { deliveryCommand } from "@/lib/delivery/commands";
import {
  commandInput,
  operatingLocations,
  DeliveryError,
  requireRole,
} from "@/lib/delivery/domain";
import {
  json,
  failure,
  originCheck,
  boundedBody,
  formUpload,
  limitRequests,
} from "@/lib/delivery/http";
import { database } from "@/lib/db";
import { reviewPartnerApplication } from "@/lib/delivery/partner-applications";
import { sendPartnerInvitation } from "@/lib/delivery/partner-invitations";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ resource: string }> };
export async function GET(request: Request, context: Context) {
  try {
    const { resource } = await context.params;
    const actor = await deliveryActor(
      resource === "workspaces" ? undefined : workspaceFromRequest(request),
    );
    if (resource === "workspaces")
      return json({ workspaces: actor.workspaces ?? [], role: actor.role });
    const params = new URL(request.url).searchParams;
    if (resource === "finance-export") {
      requireRole(actor, "ADMIN");
      const format = z
        .enum(["csv", "xlsx"])
        .parse(params.get("format") ?? "xlsx");
      await limitRequests(actor, "finance-export", 5, 1);
      const { financeReport } = await import("@/lib/delivery/finance-report");
      const { deliveriesCsv, financeWorkbook } =
        await import("@/lib/delivery/finance-export");
      const report = await financeReport(actor, params);
      const bytes =
        format === "csv"
          ? Buffer.from(deliveriesCsv(report), "utf8")
          : await financeWorkbook(report);
      return new Response(new Uint8Array(bytes), {
        headers: {
          "Content-Type":
            format === "csv"
              ? "text/csv; charset=utf-8"
              : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="igo-completed-deliveries.${format}"`,
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
    if (resource === "workspace-profiles")
      return json(await workspaceProfiles(actor));
    if (resource === "deletion-preview") {
      requireSuperAdmin(actor);
      return json(
        await previewDeletion(
          actor,
          deletionTarget.parse(Object.fromEntries(params)),
        ),
      );
    }
    if (resource === "deletion-cleanup") {
      requireSuperAdmin(actor);
      return json({ pending: await database().deliveryDeletedFile.count() });
    }
    if (resource === "partner-logo") {
      const { partnerLogo } = await import("@/lib/delivery/partner-logos");
      const applicationId = params.get("id");
      const logo = await partnerLogo(
        actor,
        applicationId ? z.uuid().parse(applicationId) : undefined,
      );
      return new Response(logo, {
        headers: {
          "Content-Type": "image/webp",
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
    if (resource === "template") {
      requireRole(actor, "ADMIN", "PARTNER");
      const file = await readFile(
        join(process.cwd(), "public/templates/igo-packages.xlsx"),
      );
      return new NextResponse(file, {
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": 'attachment; filename="igo-packages.xlsx"',
          "Cache-Control": "private, no-store",
        },
      });
    }
    if (resource === "receipt") {
      const { receiptUrl } = await import("@/lib/delivery/storage");
      return NextResponse.redirect(
        await receiptUrl(actor, z.uuid().parse(params.get("id"))),
        {
          headers: {
            "Cache-Control": "private, no-store",
            "Referrer-Policy": "no-referrer",
          },
        },
      );
    }
    return json(await deliveryQuery(actor, resource, params));
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request, context: Context) {
  try {
    originCheck(request);
    const actor = await deliveryActor(workspaceFromRequest(request)),
      { resource } = await context.params;
    await limitRequests(
      actor,
      resource,
      ["receipt", "import"].includes(resource) ? 10 : 60,
      ["receipt", "import"].includes(resource) ? 10 : 1,
    );
    if (resource === "push-subscription") {
      requireRole(actor, "ADMIN", "PARTNER", "DRIVER");
      const { savePushSubscription } = await import("@/lib/delivery/push");
      return json(
        await savePushSubscription(
          actor,
          JSON.parse((await boundedBody(request, 6000)).toString("utf8")),
        ),
      );
    }
    if (resource === "receipt") {
      const { uploadReceipt } = await import("@/lib/delivery/storage");
      const form = await formUpload(request, 5 * 1024 * 1024 + 16000),
        file = form.get("file");
      if (!(file instanceof File))
        throw new DeliveryError("Choose a receipt image.");
      return json(
        await uploadReceipt(actor, Buffer.from(await file.arrayBuffer())),
      );
    }
    const key = z.uuid().parse(request.headers.get("idempotency-key"));
    if (resource === "workspace-profiles") {
      const input = workspaceProfileInput.parse(
        JSON.parse((await boundedBody(request, 4000)).toString("utf8")),
      );
      return json(await updateWorkspaceProfile(actor, key, input));
    }
    if (resource === "delete-data") {
      requireSuperAdmin(actor);
      const input = deletionInput.parse(
        JSON.parse((await boundedBody(request, 4000)).toString("utf8")),
      );
      const result = await deleteDeliveryData(actor, key, input);
      for (const path of [
        "/delivery/[[...section]]",
        "/partner/[[...section]]",
        "/delivery/invoice/[id]",
        "/delivery/paid-invoice/[id]",
        "/partner/invoice/[id]",
        "/partner/paid-invoice/[id]",
      ])
        revalidatePath(path, "page");
      revalidatePath("/rider", "layout");
      const files = await cleanupDeletedFiles();
      return json({ ...result, files });
    }
    if (resource === "deletion-cleanup") {
      requireSuperAdmin(actor);
      return json(await cleanupDeletedFiles());
    }
    if (resource === "admin-access") {
      requireSuperAdmin(actor);
      const input = adminAccessInput.parse(
        JSON.parse((await boundedBody(request, 4000)).toString("utf8")),
      );
      return json(await manageAdministrator(actor, key, input));
    }
    if (resource === "partner-review" || resource === "partner-invitation") {
      requireRole(actor, "ADMIN");
      const body = JSON.parse(
        (await boundedBody(request, 4000)).toString("utf8"),
      );
      if (resource === "partner-invitation") {
        const input = z
          .object({ applicationId: z.uuid() })
          .strict()
          .parse(body);
        return json(
          await sendPartnerInvitation(
            actor,
            input.applicationId,
            new URL(request.url).origin,
          ),
        );
      }
      const input = z
        .object({
          applicationId: z.uuid(),
          status: z.enum(["APPROVED", "REJECTED"]),
          note: z.string().trim().min(3).max(500),
          operatingLocation: z.enum(operatingLocations).optional(),
        })
        .strict()
        .parse(body);
      return json(
        await reviewPartnerApplication(
          actor,
          key,
          input.applicationId,
          input.status,
          input.note,
          input.operatingLocation,
        ),
      );
    }
    if (resource === "import") {
      const { packageImport } = await import("@/lib/delivery/import-service");
      const form = await formUpload(request, 1024 * 1024 + 16000),
        file = form.get("file");
      if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".xlsx"))
        throw new DeliveryError("Choose an .xlsx package workbook.");
      return json(
        await packageImport(
          actor,
          Buffer.from(await file.arrayBuffer()),
          String(form.get("mode")),
          key,
          form.get("partnerId") ? String(form.get("partnerId")) : undefined,
        ),
      );
    }
    if (resource === "invoice-run") {
      requireRole(actor, "ADMIN");
      const [result] = await database().$transaction(async (tx) => {
        await assertAdministrator(tx, actor);
        return tx.$queryRaw<
          { result: unknown }[]
        >`SELECT public.igo_invoice_due() AS result`;
      });
      return json({
        message: "Due invoice cycles processed.",
        result: result.result,
      });
    }
    if (resource !== "commands")
      throw new DeliveryError("Unknown delivery command.", 404);
    const command = commandInput.parse(
      JSON.parse((await boundedBody(request, 64000)).toString("utf8")),
    );
    if (command.type === "sendPartnerMessage" || command.type === "sendAdminMessage" || command.type === "testPush")
      await limitRequests(actor, command.type, command.type === "testPush" ? 3 : 10, 1);
    const result = await deliveryCommand(actor, key, command);
    if (command.type === "rate" || command.type === "destination") {
      try {
        revalidateTag("delivery-public-rates", { expire: 0 });
      } catch {
        console.error(
          "Public rate cache refresh deferred to its short expiry.",
        );
      }
    }
    after(async () => {
      try {
        const { dispatchRiderPush } = await import("@/lib/delivery/push");
        await dispatchRiderPush();
      } catch {
        console.error("Rider push dispatch deferred to retry queue.");
      }
    });
    return json(result);
  } catch (error) {
    return failure(error);
  }
}
