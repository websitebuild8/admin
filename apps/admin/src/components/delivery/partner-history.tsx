"use client";
import { DatePeriodFilter } from "./date-period-filter";
import {
  allTime,
  parcelDateLabel,
  periodQuery,
  type PeriodSelection,
} from "@/lib/delivery/reporting-period";
import { deliveryFetch } from "@/lib/delivery/fetch";
import { useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  History,
  ReceiptText,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { money } from "@/lib/delivery/domain";
import type { PartnerHistory } from "@/lib/delivery/partner-history-contract";
import { DeliverySkeleton } from "./skeleton";
import {
  invoicePaymentStatus,
  invoiceStatusLabels,
} from "@/lib/delivery/invoice-lifecycle";

type InvoiceList = {
  items: {
    id: string;
    publicId: string;
    total: number;
    paid: number;
    createdAt: string;
    dispatch: { sentAt: string } | null;
    cycle: { localDate: string } | null;
    _count?: { payments?: number };
    paidInvoice?: {
      paidAt: string;
      dispatch: { sentAt: string } | null;
    } | null;
  }[];
  total: number;
  page: number;
  pageSize: number;
};
const date = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("en-GB", {
        timeZone: "Indian/Maldives",
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value))
    : "—";
const labels: Record<string, string> = {
  REGISTERED: "Registered",
  PICKED_UP: "Picked up",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
};

export function HistoryPager({
  total,
  page,
  onPage,
}: {
  total: number;
  page: number;
  onPage: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / 10));
  return (
    <div className="d-pagination">
      <span>
        {total
          ? `${(page - 1) * 10 + 1}–${Math.min(page * 10, total)} of ${total}`
          : "0 records"}{" "}
        · 10 per page
      </span>
      <div>
        <Button
          variant="outline"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          aria-label="Previous history page"
        >
          <ChevronLeft size={14} />
        </Button>
        <span>
          {page} / {pages}
        </span>
        <Button
          variant="outline"
          disabled={page >= pages}
          onClick={() => onPage(page + 1)}
          aria-label="Next history page"
        >
          <ChevronRight size={14} />
        </Button>
      </div>
    </div>
  );
}

export function PartnerHistoryModal({
  id,
  close,
  viewInvoice,
  changed,
}: {
  id: string;
  close: () => void;
  viewInvoice: (id: string) => void;
  changed: () => void;
}) {
  const [name, setName] = useState("Partner history");
  const [selection, setSelection] = useState<PeriodSelection>(allTime);
  const [tab, setTab] = useState("deliveries"),
    [page, setPage] = useState(1),
    [filter, setFilter] = useState("ALL"),
    [q, setQ] = useState(""),
    [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{
    key: string;
    history?: PartnerHistory;
    invoices?: InvoiceList;
    error?: string;
  }>();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const retry = useRef<{ body: string; key: string } | null>(null),
    running = useRef(false);
  const query = new URLSearchParams({
    partnerId: id,
    page: String(page),
    filter,
    q,
    ...Object.fromEntries(new URLSearchParams(periodQuery(selection))),
  });
  const resource = tab === "deliveries" ? "partner-history" : "invoices";
  const key = `${resource}?${query}&revision=${revision}`;
  useEffect(() => {
    const controller = new AbortController();
    deliveryFetch(`/api/delivery/${key}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const value = await response.json();
        if (!response.ok)
          throw new Error(
            value.error ?? "Could not load this partner’s history.",
          );
        if (controller.signal.aborted) return;
        if (resource === "partner-history") setName(value.partner.businessName);
        setResult({
          key,
          ...(resource === "partner-history"
            ? { history: value }
            : { invoices: value }),
        });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setResult({ key, error: error.message });
      });
    return () => controller.abort();
  }, [key, resource]);
  const data =
    result &&
    (result.key === key ||
      (tab === "deliveries" ? result.history : result.invoices))
      ? result
      : undefined;
  const loading = result?.key !== key;
  const history = data?.history,
    invoices = data?.invoices;
  async function createInvoice() {
    if (!history || running.current) return;
    running.current = true;
    setBusy(true);
    setError("");
    const body = JSON.stringify({
      type: "createPartnerInvoice",
      partnerId: id,
      expectedCount: history.summary.eligibleCount,
      expectedTotal: history.summary.eligibleTotal,
    });
    if (retry.current?.body !== body)
      retry.current = { body, key: crypto.randomUUID() };
    try {
      const response = await deliveryFetch("/api/delivery/commands", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": retry.current.key,
        },
        body,
      });
      const value = await response.json();
      if (!response.ok)
        throw new Error(value.error ?? "Could not create the invoice.");
      toast.success(value.message);
      changed();
      viewInvoice(value.invoiceId);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not create the invoice.",
      );
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) close();
      }}
    >
      <DialogContent className="d-modal d-partner-history">
        <DialogHeader>
          <DialogTitle>
            <History size={19} /> {name}
          </DialogTitle>
          <DialogDescription>
            Delivery history, issued invoices and outstanding delivery fees for
            this business.
          </DialogDescription>
        </DialogHeader>
        <div className="d-history-toolbar">
          <div
            className="d-history-tabs"
            role="group"
            aria-label="Partner history view"
          >
            {["deliveries", "invoices"].map((value) => (
              <Button
                key={value}
                variant={tab === value ? "default" : "ghost"}
                aria-pressed={tab === value}
                disabled={busy}
                onClick={() => {
                  setTab(value);
                  setPage(1);
                  setError("");
                }}
              >
                {value === "deliveries" ? "Deliveries" : "Invoices"}
              </Button>
            ))}
          </div>
          <Button
            variant="outline"
            aria-label="Refresh partner history"
            disabled={busy}
            onClick={() => setRevision((value) => value + 1)}
          >
            <RefreshCw size={15} />
          </Button>
        </div>
        <DatePeriodFilter
          selection={selection}
          onChange={(next) => {
            setSelection(next);
            setPage(1);
            setResult(undefined);
          }}
          basis={
            tab === "invoices" ? "Invoice issue date" : parcelDateLabel(filter)
          }
          disabled={busy}
        />
        {loading && data && (
          <p role="status" className="d-history-hint">
            Updating history…
          </p>
        )}
        {data?.error ? (
          <div className="d-error" role="alert">
            {data.error}
          </div>
        ) : !data ? (
          <DeliverySkeleton />
        ) : history ? (
          <>
            <p className="d-history-contact">
              {history.partner.account.name} · {history.partner.account.phone} ·{" "}
              {history.partner.pickupAddress}
            </p>
            <div className="d-history-stats">
              <div>
                <span>Registered</span>
                <strong>{history.summary.registered}</strong>
              </div>
              <div>
                <span>Picked up</span>
                <strong>{history.summary.pickedUp}</strong>
              </div>
              <div>
                <span>Completed</span>
                <strong>{history.summary.delivered}</strong>
              </div>
              <div>
                <span>Outstanding · all time</span>
                <strong>{money(history.summary.outstanding)}</strong>
              </div>
            </div>
            <div className="d-history-invoice">
              <div>
                <span>Ready to invoice · all time</span>
                <strong>{money(history.summary.eligibleTotal)}</strong>
                <p>
                  {history.summary.eligibleCount} completed, uninvoiced{" "}
                  {history.summary.eligibleCount === 1
                    ? "delivery"
                    : "deliveries"}{" "}
                  across all pages and dates, including outside the selected
                  period.
                </p>
              </div>
              <Button
                disabled={busy || loading || !history.summary.eligibleCount}
                onClick={createInvoice}
              >
                <ReceiptText size={16} />
                {busy ? "Creating…" : "Create invoice"}
              </Button>
            </div>
            <p className="d-history-hint">
              Creating an invoice records the charge and makes it visible in the
              partner’s Invoices. Review it, then select “Send invoice” to
              notify them.
            </p>
            <div className="d-history-filters">
              <Input
                aria-label="Search partner deliveries"
                placeholder="Package ID, reference or recipient"
                value={q}
                maxLength={100}
                disabled={busy}
                onChange={(event) => {
                  setQ(event.target.value);
                  setPage(1);
                }}
              />
              <label>
                <span className="sr-only">Filter delivery history</span>
                <select
                  value={filter}
                  disabled={busy}
                  onChange={(event) => {
                    setFilter(event.target.value);
                    setPage(1);
                  }}
                >
                  <option value="ALL">All deliveries</option>
                  <option value="REGISTERED">Registered</option>
                  <option value="PICKED_UP">Picked up</option>
                  <option value="DELIVERED">Completed</option>
                  <option value="UNINVOICED">Completed · uninvoiced</option>
                  <option value="CANCELLED">Cancelled</option>
                </select>
              </label>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  {[
                    "Package / recipient",
                    "Status / rider",
                    "Delivered (MVT)",
                    "Delivery fee",
                    "Invoice",
                  ].map((label) => (
                    <TableHead key={label}>{label}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <strong>{item.publicId}</strong>
                      <small>
                        {item.recipientName} · {item.externalReference}
                      </small>
                      <small>{item.destination}</small>
                    </TableCell>
                    <TableCell>
                      <span className={`d-status ${item.state.toLowerCase()}`}>
                        {labels[item.state] ?? item.state}
                      </span>
                      <small>{item.driver?.name ?? "Unassigned"}</small>
                    </TableCell>
                    <TableCell>{date(item.deliveredAt)}</TableCell>
                    <TableCell>
                      {money(item.fee)}
                      {item.state !== "DELIVERED" && (
                        <small>
                          {item.state === "CANCELLED"
                            ? "Cancelled · not invoiced"
                            : "Estimate · not invoiced"}
                        </small>
                      )}
                    </TableCell>
                    <TableCell>
                      {item.invoiceLine ? (
                        <Button
                          variant="ghost"
                          onClick={() =>
                            viewInvoice(item.invoiceLine!.invoice.id)
                          }
                          aria-label={`View invoice ${item.invoiceLine.invoice.publicId}`}
                        >
                          <ReceiptText size={15} /> View
                        </Button>
                      ) : item.state === "DELIVERED" ? (
                        "Uninvoiced"
                      ) : (
                        "—"
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {!history.items.length && (
                  <TableRow>
                    <TableCell colSpan={5}>
                      No deliveries match this view.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            <HistoryPager
              total={history.total}
              page={history.page}
              onPage={setPage}
            />
          </>
        ) : invoices ? (
          <>
            <p className="d-history-hint">
              Invoices issued in the selected period. Earlier unpaid invoices
              remain outstanding.
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  {[
                    "Invoice / issued (MVT)",
                    "Total",
                    "Confirmed paid",
                    "Outstanding",
                    "Actions",
                  ].map((label) => (
                    <TableHead key={label}>{label}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.items.map((invoice) => (
                  <TableRow key={invoice.id}>
                    <TableCell>
                      <strong>{invoice.publicId}</strong>
                      <small>{date(invoice.createdAt)}</small>
                      <small>
                        {invoice.cycle
                          ? "Daily invoice · delivered automatically"
                          : invoice.dispatch
                            ? `Sent ${date(invoice.dispatch.sentAt)}`
                            : "Manual invoice · not sent"}
                      </small>
                    </TableCell>
                    <TableCell>{money(invoice.total)}</TableCell>
                    <TableCell>{money(invoice.paid)}</TableCell>
                    <TableCell>
                      {money(invoice.total - invoice.paid)}
                      <small>
                        {invoiceStatusLabels[invoicePaymentStatus(invoice)]}
                      </small>
                      {invoice.paidInvoice && (
                        <small>
                          {invoice.paidInvoice.dispatch
                            ? "Paid invoice sent"
                            : "Paid invoice ready"}
                        </small>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="outline"
                        onClick={() => viewInvoice(invoice.id)}
                      >
                        <ReceiptText size={15} /> View invoice
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {!invoices.items.length && (
                  <TableRow>
                    <TableCell colSpan={5}>
                      No invoices issued for this partner in the selected
                      period.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            <HistoryPager
              total={invoices.total}
              page={invoices.page}
              onPage={setPage}
            />
          </>
        ) : null}
        {error && (
          <div className="d-error" role="alert">
            {error}{" "}
            <Button
              variant="ghost"
              onClick={() => setRevision((value) => value + 1)}
            >
              Refresh totals
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
