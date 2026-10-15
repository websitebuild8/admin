import { z } from "zod";
import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { deliveryActor } from "@/lib/delivery/auth";
import { deliveryQuery } from "@/lib/delivery/queries";
import { deliveryCommand } from "@/lib/delivery/commands";
import {
  commandInput,
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
import { uploadReceipt, receiptUrl } from "@/lib/delivery/storage";
import { packageImport } from "@/lib/delivery/import-service";
import { database } from "@/lib/db";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ resource: string }> };
export async function GET(request: Request, context: Context) {
  try {
    const actor = await deliveryActor(),
      { resource } = await context.params;
    const params = new URL(request.url).searchParams;
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
    if (resource === "receipt")
      return NextResponse.redirect(
        await receiptUrl(actor, z.uuid().parse(params.get("id"))),
        {
          headers: {
            "Cache-Control": "private, no-store",
            "Referrer-Policy": "no-referrer",
          },
        },
      );
    return json(await deliveryQuery(actor, resource, params));
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request, context: Context) {
  try {
    originCheck(request);
    const actor = await deliveryActor(),
      { resource } = await context.params;
    await limitRequests(
      actor,
      resource,
      ["receipt", "import"].includes(resource) ? 10 : 60,
      ["receipt", "import"].includes(resource) ? 10 : 1,
    );
    if (resource === "receipt") {
      const form = await formUpload(request, 5 * 1024 * 1024 + 16000),
        file = form.get("file");
      if (!(file instanceof File))
        throw new DeliveryError("Choose a receipt image.");
      return json(
        await uploadReceipt(actor, Buffer.from(await file.arrayBuffer())),
      );
    }
    const key = z.uuid().parse(request.headers.get("idempotency-key"));
    if (resource === "import") {
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
      const [result] = await database().$queryRaw<
        { result: unknown }[]
      >`SELECT public.igo_invoice_due() AS result`;
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
    return json(await deliveryCommand(actor, key, command));
  } catch (error) {
    return failure(error);
  }
}
