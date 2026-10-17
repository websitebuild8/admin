import { z } from "zod";

export const deletionKinds = [
  "PARTNER",
  "RIDER",
  "PACKAGE",
  "INVOICE",
] as const;
export type DeletionKind = (typeof deletionKinds)[number];
export const deletionTarget = z
  .object({
    kind: z.enum(deletionKinds),
    id: z.uuid(),
  })
  .strict();
export const deletionInput = deletionTarget
  .extend({
    fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    confirmation: z.string().min(1).max(250),
    reason: z
      .string()
      .trim()
      .min(5, "Give a reason of at least five characters.")
      .max(500),
  })
  .strict();
export type DeletionInput = z.infer<typeof deletionInput>;
export type DeletionPreview = {
  kind: DeletionKind;
  id: string;
  label: string;
  fingerprint: string;
  counts: { label: string; count: number }[];
  invoiceTotal: number;
  verifiedPayments: number;
  warnings: string[];
};

// Idempotency responses are caches, but their keys must not become reusable
// after deletion. Retain a tombstone and erase the response instead.
export function commandSubjects(...values: unknown[]): string[] {
  const subjects = new Set<string>();
  function visit(value: unknown) {
    if (typeof value === "string") subjects.add(value);
    else if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === "object")
      Object.values(value).forEach(visit);
  }
  values.forEach(visit);
  return [...subjects].sort();
}
