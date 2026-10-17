"use client";
import { deliveryFetch } from "@/lib/delivery/fetch";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { money, type Actor } from "@/lib/delivery/domain";
import {
  invoiceEventLabels,
  type InvoiceHistoryEvent,
} from "@/lib/delivery/invoice-lifecycle";
import type { Payment } from "./portal";
import { DeliverySkeleton } from "./skeleton";
import { HistoryPager } from "./partner-history";
type List = {
  items: (InvoiceHistoryEvent | Payment)[];
  total: number;
  page: number;
};
const stamp = (value: string) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Indian/Maldives",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
const labels: Record<string, string> = {
  PENDING: "Awaiting verification",
  CONFIRMED: "Confirmed",
  PARTIAL: "Partially verified",
  REJECTED: "Rejected",
};
export function InvoiceRecords({
  id,
  view,
  revision,
  actor,
  review,
}: {
  id: string;
  view: "payments" | "history";
  revision: number;
  actor: Actor;
  review: (payment: Payment) => void;
}) {
  const [page, setPage] = useState(1);
  const key = `invoice-${view}?id=${id}&page=${page}&revision=${revision}`;
  const [state, setState] = useState<{
    key: string;
    data?: List;
    error?: string;
  }>();
  useEffect(() => {
    const controller = new AbortController();
    deliveryFetch(`/api/delivery/${key}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        const value = await response.json();
        if (!response.ok)
          throw new Error(value.error ?? "Could not load invoice records.");
        if (!controller.signal.aborted) setState({ key, data: value });
      })
      .catch((error) => {
        if (!controller.signal.aborted) setState({ key, error: error.message });
      });
    return () => controller.abort();
  }, [key]);
  if (state?.key !== key) return <DeliverySkeleton />;
  if (state.error)
    return (
      <div className="d-error" role="alert">
        {state.error}
      </div>
    );
  const data = state.data!;
  return (
    <>
      <div className="d-invoice-records">
        <Table>
          <TableHeader>
            <TableRow>
              {(view === "history"
                ? [
                    "Event / time (MVT)",
                    "Amount",
                    "Reference / details",
                    "Evidence",
                  ]
                : [
                    "Transfer / submitted (MVT)",
                    "Submitted",
                    "Confirmed",
                    "Status / review",
                    "Actions",
                  ]
              ).map((label) => (
                <TableHead key={label}>{label}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {view === "history"
              ? (data.items as InvoiceHistoryEvent[]).map((event) => (
                  <TableRow key={event.id}>
                    <TableCell>
                      <strong>
                        {invoiceEventLabels[event.kind] ?? event.kind}
                      </strong>
                      <small>{stamp(event.occurredAt)}</small>
                    </TableCell>
                    <TableCell>
                      {event.amount === null ? "—" : money(event.amount)}
                    </TableCell>
                    <TableCell>
                      {event.reference || "—"}
                      {event.note && <small>{event.note}</small>}
                    </TableCell>
                    <TableCell>
                      {event.receiptId && (
                        <Button
                          variant="outline"
                          render={
                            <a
                              href={`/api/delivery/receipt?id=${event.receiptId}`}
                              target="_blank"
                              rel="noopener noreferrer"
                            />
                          }
                        >
                          View proof
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              : (data.items as Payment[]).map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell>
                      <strong>{payment.bankReference}</strong>
                      <small>{stamp(payment.createdAt)}</small>
                    </TableCell>
                    <TableCell>{money(payment.amount)}</TableCell>
                    <TableCell>{money(payment.confirmedAmount)}</TableCell>
                    <TableCell>
                      <span
                        className={`d-status ${payment.status.toLowerCase()}`}
                      >
                        {labels[payment.status] ?? payment.status}
                      </span>
                      {payment.reviewedAt && (
                        <small>{stamp(payment.reviewedAt)}</small>
                      )}
                      {payment.reviewNote && (
                        <small>{payment.reviewNote}</small>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="d-row-actions">
                        <Button
                          variant="outline"
                          render={
                            <a
                              href={`/api/delivery/receipt?id=${payment.receiptId}`}
                              target="_blank"
                              rel="noopener noreferrer"
                            />
                          }
                        >
                          View proof
                        </Button>
                        {actor.role === "ADMIN" &&
                          payment.status === "PENDING" && (
                            <Button onClick={() => review(payment)}>
                              Verify payment
                            </Button>
                          )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
            {!data.items.length && (
              <TableRow>
                <TableCell colSpan={view === "history" ? 4 : 5}>
                  No{" "}
                  {view === "history"
                    ? "history events"
                    : "payment submissions"}{" "}
                  for this invoice yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <HistoryPager total={data.total} page={page} onPage={setPage} />
    </>
  );
}
