"use client";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Download, ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { deliveryFetch } from "@/lib/delivery/fetch";
import { money } from "@/lib/delivery/domain";
import {
  financeStatuses,
  financeTabs,
  type FinanceTab,
  type FinanceSummary,
  type FinanceList,
  type FinanceInvoice,
  type FinanceTransfer,
  type FinanceDelivery,
} from "@/lib/delivery/finance-contract";
import {
  invoicePaymentStatus,
  invoiceStatusLabels,
} from "@/lib/delivery/invoice-lifecycle";
import {
  periodQuery,
  type PeriodSelection,
} from "@/lib/delivery/reporting-period";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DeliverySkeleton } from "./skeleton";
import { DeleteDataButton } from "./delete-data-button";
import type { Payment } from "./portal";

const labels: Record<string, string> = {
  ALL: "All statuses",
  OUTSTANDING: "Outstanding",
  AWAITING_VERIFICATION: "Awaiting verification",
  UNPAID: "Unpaid",
  PARTIALLY_PAID: "Partially paid",
  PAID: "Paid",
  PENDING: "Needs verification",
  CONFIRMED: "Confirmed",
  PARTIAL: "Partially verified",
  REJECTED: "Rejected",
  UNINVOICED: "Awaiting billing",
  INVOICED: "Invoiced",
};
const tabs = {
  invoices: "Invoices",
  transfers: "Bank transfers",
  deliveries: "Completed deliveries",
};
const stamp = (s: string | null) =>
  s
    ? new Intl.DateTimeFormat("en-GB", {
        timeZone: "Indian/Maldives",
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(s))
    : "—";
function CardMoney({ amount }: { amount: number }) {
  return (
    <strong>
      <small>MVR</small>
      <span>
        {(amount / 100).toLocaleString("en-GB", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}
      </span>
    </strong>
  );
}
function useFinance<T>(
  resource: string,
  query: string,
  revision: number,
): { data?: T; error?: string } {
  const key = `${resource}?${query}&revision=${revision}`;
  const [state, setState] = useState<{
    key: string;
    data?: T;
    error?: string;
  }>();
  useEffect(() => {
    const c = new AbortController();
    deliveryFetch(`/api/delivery/${key}`, {
      signal: c.signal,
      cache: "no-store",
    })
      .then(async (r) => {
        const v = await r.json();
        if (!r.ok)
          throw new Error(v.error ?? "Could not load finance records.");
        if (!c.signal.aborted) setState({ key, data: v });
      })
      .catch((e) => {
        if (!c.signal.aborted) setState({ key, error: e.message });
      });
    return () => c.abort();
  }, [key]);
  return state?.key === key ? state : {};
}
export function FinancePanel({
  selection,
  revision,
  viewInvoice,
  review,
  superAdmin,
  changed,
}: {
  selection: PeriodSelection;
  revision: number;
  viewInvoice: (id: string, tab?: "packages" | "payments" | "history") => void;
  review: (p: Payment) => void;
  superAdmin: boolean;
  changed: () => void;
}) {
  const params = useSearchParams(),
    router = useRouter();
  const tab: FinanceTab = financeTabs.includes(params.get("tab") as FinanceTab)
    ? (params.get("tab") as FinanceTab)
    : "invoices";
  const status = (financeStatuses[tab] as readonly string[]).includes(
    params.get("status") ?? "",
  )
    ? params.get("status")!
    : "ALL";
  const partnerId = params.get("partnerId") ?? "",
    q = params.get("q") ?? "";
  const page = Math.max(1, Number(params.get("page")) || 1);
  const [partnerSearch, setPartnerSearch] = useState(""),
    [exporting, setExporting] = useState(""),
    [exportError, setExportError] = useState("");
  const scope = `partnerId=${encodeURIComponent(partnerId)}&${periodQuery(selection)}`;
  const data = useFinance<FinanceList>(
    "finance",
    `${scope}&tab=${tab}&status=${status}&q=${encodeURIComponent(q)}&page=${page}`,
    revision,
  );
  const summary = useFinance<FinanceSummary>(
    "finance-summary",
    scope,
    revision,
  );
  const partners = useFinance<{ id: string; businessName: string }[]>(
    "finance-partners",
    `q=${encodeURIComponent(partnerSearch)}`,
    revision,
  );
  function navigate(values: Record<string, string>) {
    const next = new URLSearchParams(params.toString());
    next.set("page", "1");
    for (const [k, v] of Object.entries(values)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    router.push(`/delivery/finance?${next}`, { scroll: false });
  }
  function find(e: FormEvent) {
    e.preventDefault();
    navigate({
      q: String(
        new FormData(e.currentTarget as HTMLFormElement).get("search") ?? "",
      ),
    });
  }
  async function download(format: "csv" | "xlsx") {
    setExporting(format);
    setExportError("");
    try {
      const r = await deliveryFetch(
        `/api/delivery/finance-export?${scope}&format=${format}`,
        { cache: "no-store" },
      );
      if (!r.ok) {
        const e = await r.json();
        throw new Error(e.error ?? "Could not prepare the report.");
      }
      const url = URL.createObjectURL(await r.blob()),
        a = document.createElement("a");
      a.href = url;
      a.download = `igo-completed-deliveries-${selection.value || "all-time"}.${format}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setExportError(
        e instanceof Error ? e.message : "Could not download the report.",
      );
    } finally {
      setExporting("");
    }
  }
  const s = summary.data;
  return (
    <div className="d-finance">
      <div className="d-finance-toolbar">
        <div className="d-finance-partner">
          {partnerId ? (
            <Button
              variant="outline"
              onClick={() => navigate({ partnerId: "" })}
            >
              {data.data?.partner?.businessName ?? "Selected partner"}
              <X size={14} />
            </Button>
          ) : (
            <Input
              aria-label="Find partner"
              placeholder="Find a partner…"
              value={partnerSearch}
              onChange={(e) => setPartnerSearch(e.target.value)}
            />
          )}
          {!partnerId && partnerSearch && (
            <div
              className="d-finance-partner-results"
              aria-label="Matching partners"
            >
              {partners.error ? (
                <span role="alert">{partners.error}</span>
              ) : partners.data?.length ? (
                partners.data.map((p) => (
                  <Button
                    key={p.id}
                    variant="ghost"
                    onClick={() => {
                      setPartnerSearch("");
                      navigate({ partnerId: p.id });
                    }}
                  >
                    {p.businessName}
                  </Button>
                ))
              ) : (
                <span>
                  {partners.data ? "No matching partners" : "Searching…"}
                </span>
              )}
            </div>
          )}
        </div>
        <div
          className="d-row-actions"
          aria-label="Download completed delivery reports"
        >
          <Button
            variant="outline"
            disabled={!!exporting}
            onClick={() => download("csv")}
          >
            <Download size={15} />
            {exporting === "csv" ? "Preparing…" : "Deliveries CSV"}
          </Button>
          <Button disabled={!!exporting} onClick={() => download("xlsx")}>
            <Download size={15} />
            {exporting === "xlsx" ? "Preparing…" : "Finance Excel"}
          </Button>
        </div>
      </div>
      {exportError && (
        <div className="d-error" role="alert">
          {exportError}
        </div>
      )}
      {summary.error && (
        <div className="d-error" role="alert">
          {summary.error}
        </div>
      )}
      <div className="d-finance-stats" aria-busy={!s}>
        <button
          onClick={() =>
            navigate({
              tab: "invoices",
              status: "OUTSTANDING",
              period: "ALL_TIME",
              value: "",
              q: "",
            })
          }
        >
          <span>Outstanding · all dates</span>
          {s ? <CardMoney amount={s.outstanding} /> : <strong>—</strong>}
        </button>
        <button
          onClick={() =>
            navigate({
              tab: "transfers",
              status: "PENDING",
              period: "ALL_TIME",
              value: "",
              q: "",
            })
          }
        >
          <span>Needs verification · all dates</span>
          <strong>{s ? String(s.pendingCount) : "—"}</strong>
          {s && <span>{money(s.pendingAmount)}</span>}
        </button>
        <button
          onClick={() => navigate({ tab: "deliveries", status: "ALL", q: "" })}
        >
          <span>Completed delivery fees</span>
          {s ? <CardMoney amount={s.deliveredFees} /> : <strong>—</strong>}
        </button>
        <div>
          <span>Verified payments · reviewed in period</span>
          {s ? <CardMoney amount={s.confirmed} /> : <strong>—</strong>}
        </div>
      </div>
      <nav className="d-finance-tabs" aria-label="Finance sections">
        {financeTabs.map((t) => (
          <Button
            key={t}
            variant={tab === t ? "default" : "ghost"}
            aria-current={tab === t ? "page" : undefined}
            onClick={() => {
              navigate({ tab: t, status: "ALL", q: "" });
            }}
          >
            {tabs[t]}
          </Button>
        ))}
      </nav>
      <div className="d-finance-list-controls">
        <form onSubmit={find} className="d-finance-search">
          <Input
            key={`${tab}:${q}`}
            name="search"
            aria-label="Search finance records"
            placeholder={
              tab === "transfers"
                ? "Bank reference, invoice or partner…"
                : tab === "invoices"
                  ? "Invoice or partner…"
                  : "Package, customer, invoice or partner…"
            }
            defaultValue={q}
          />
          <Button variant="outline" type="submit" aria-label="Search finance">
            <Search size={16} />
          </Button>
        </form>
        <Select
          value={status}
          onValueChange={(v) => navigate({ status: v ?? "ALL" })}
        >
          <SelectTrigger aria-label="Finance status">
            <SelectValue>{labels[status]}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {financeStatuses[tab].map((v) => (
              <SelectItem value={v} key={v}>
                {labels[v]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {data.error ? (
        <div className="d-error" role="alert">
          {data.error}
        </div>
      ) : !data.data ? (
        <DeliverySkeleton />
      ) : (
        <section className="d-card d-finance-records" data-tab={tab}>
          <Table>
            <caption className="sr-only">
              {tabs[tab]} · {data.data.total} records
            </caption>
            <TableHeader>
              <TableRow>
                {(tab === "invoices"
                  ? [
                      "Invoice / partner",
                      "Issued (MVT)",
                      "Total",
                      "Verified paid",
                      "Outstanding / status",
                      "Actions",
                    ]
                  : tab === "transfers"
                    ? [
                        "Bank reference / partner",
                        "Invoice",
                        "Submitted",
                        "Verified",
                        "Status / reviewed",
                        "Actions",
                      ]
                    : [
                        "Package / partner",
                        "Customer",
                        "Delivered (MVT)",
                        "Fee",
                        "Invoice",
                        "Actions",
                      ]
                ).map((h) => (
                  <TableHead key={h}>{h}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {!data.data.items.length ? (
                <TableRow>
                  <TableCell colSpan={6} className="d-finance-empty">
                    No matching {tabs[tab].toLowerCase()}
                  </TableCell>
                </TableRow>
              ) : tab === "invoices" ? (
                (data.data.items as FinanceInvoice[]).map((i) => (
                  <TableRow key={i.id}>
                    <TableCell>
                      <Button variant="link" onClick={() => viewInvoice(i.id)}>
                        {i.publicId}
                      </Button>
                      <small>{i.partner.businessName}</small>
                    </TableCell>
                    <TableCell>{stamp(i.createdAt)}</TableCell>
                    <TableCell>{money(i.total)}</TableCell>
                    <TableCell>{money(i.paid)}</TableCell>
                    <TableCell>
                      <strong>{money(i.total - i.paid)}</strong>
                      <span
                        className="d-finance-status"
                        data-status={invoicePaymentStatus(i)}
                      >
                        {invoiceStatusLabels[invoicePaymentStatus(i)]}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="d-row-actions">
                        <Button
                          variant="outline"
                          onClick={() => viewInvoice(i.id)}
                        >
                          Open invoice
                        </Button>
                        <Button
                          variant={i._count.payments ? "default" : "ghost"}
                          onClick={() => viewInvoice(i.id, "payments")}
                        >
                          {i._count.payments
                            ? `Review transfers (${i._count.payments})`
                            : "Transfers"}
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={() => viewInvoice(i.id, "history")}
                        >
                          History
                        </Button>
                        {superAdmin && (
                          <DeleteDataButton
                            kind="INVOICE"
                            id={i.id}
                            label={i.publicId}
                            changed={changed}
                          />
                        )}
                      </div>
                      {i.paidInvoice && !i.paidInvoice.dispatch && (
                        <small>Paid invoice ready to send</small>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              ) : tab === "transfers" ? (
                (data.data.items as FinanceTransfer[]).map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <strong>{p.bankReference}</strong>
                      <small>{p.partner.businessName}</small>
                      <small>{stamp(p.createdAt)}</small>
                      <div className="d-finance-mobile-only">
                        <Button
                          variant="link"
                          onClick={() => viewInvoice(p.invoiceId, "payments")}
                        >
                          {p.invoice.publicId}
                        </Button>
                        <small>Submitted {money(p.amount)}</small>
                        <small>Verified {money(p.confirmedAmount)}</small>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="link"
                        onClick={() => viewInvoice(p.invoiceId, "payments")}
                      >
                        {p.invoice.publicId}
                      </Button>
                    </TableCell>
                    <TableCell>{money(p.amount)}</TableCell>
                    <TableCell>{money(p.confirmedAmount)}</TableCell>
                    <TableCell>
                      <span className="d-finance-status" data-status={p.status}>
                        {labels[p.status]}
                      </span>
                      {p.reviewedAt && <small>{stamp(p.reviewedAt)}</small>}
                    </TableCell>
                    <TableCell>
                      <div className="d-row-actions">
                        <Button
                          variant="outline"
                          render={
                            <a
                              href={`/api/delivery/receipt?id=${p.receiptId}`}
                              target="_blank"
                              rel="noopener noreferrer"
                            />
                          }
                        >
                          Receipt
                        </Button>
                        {p.status === "PENDING" && (
                          <Button onClick={() => review(p)}>
                            Verify transfer
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          onClick={() => viewInvoice(p.invoiceId, "history")}
                        >
                          History
                        </Button>
                      </div>
                      {p.reviewNote && <small>{p.reviewNote}</small>}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                (data.data.items as FinanceDelivery[]).map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <strong>{p.publicId}</strong>
                      <small>{p.externalReference}</small>
                      <small>{p.partner.businessName}</small>
                      <div className="d-finance-mobile-only">
                        <small>{stamp(p.deliveredAt)}</small>
                        <small>{p.driver?.name ?? "—"}</small>
                        <small>{p.recipientName}</small>
                      </div>
                    </TableCell>
                    <TableCell>
                      {p.recipientName}
                      <small>{p.destination}</small>
                    </TableCell>
                    <TableCell>
                      {stamp(p.deliveredAt)}
                      <small>{p.driver?.name ?? "—"}</small>
                    </TableCell>
                    <TableCell>{money(p.fee)}</TableCell>
                    <TableCell>
                      {p.invoiceLine ? (
                        <>
                          <Button
                            variant="link"
                            onClick={() =>
                              viewInvoice(p.invoiceLine!.invoice.id)
                            }
                          >
                            {p.invoiceLine.invoice.publicId}
                          </Button>
                          <span
                            className="d-finance-status"
                            data-status={invoicePaymentStatus(
                              p.invoiceLine.invoice,
                            )}
                          >
                            {
                              invoiceStatusLabels[
                                invoicePaymentStatus(p.invoiceLine.invoice)
                              ]
                            }
                          </span>
                        </>
                      ) : (
                        <span>Awaiting billing</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {p.invoiceLine && (
                        <Button
                          variant="outline"
                          onClick={() => viewInvoice(p.invoiceLine!.invoice.id)}
                        >
                          Open invoice
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          <div className="d-finance-pager">
            <span>
              {data.data.total
                ? `${(page - 1) * 10 + 1}–${Math.min(page * 10, data.data.total)}`
                : "0"}{" "}
              of {data.data.total}
            </span>
            <span>
              Page {page} / {Math.max(1, Math.ceil(data.data.total / 10))}
            </span>
            <div>
              <Button
                variant="outline"
                aria-label="Previous finance page"
                disabled={page <= 1}
                onClick={() => navigate({ page: String(page - 1) })}
              >
                <ChevronLeft size={16} />
              </Button>
              <Button
                variant="outline"
                aria-label="Next finance page"
                disabled={page * 10 >= data.data.total}
                onClick={() => navigate({ page: String(page + 1) })}
              >
                <ChevronRight size={16} />
              </Button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
