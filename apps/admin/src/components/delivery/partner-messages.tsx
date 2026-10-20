"use client";
import { useEffect, useRef, useState } from "react";
import {
  MessageSquare,
  BellRing,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { deliveryFetch } from "@/lib/delivery/fetch";
import { money } from "@/lib/delivery/domain";
import type {
  FinanceInvoice,
  FinanceList,
} from "@/lib/delivery/finance-contract";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";

type Partner = { id: string; businessName: string };
function useMessageData<T>(resource: string | null): {
  data?: T;
  error?: string;
} {
  const [state, setState] = useState<{
    resource: string;
    data?: T;
    error?: string;
  }>();
  useEffect(() => {
    if (!resource) return;
    const c = new AbortController(),
      timer = setTimeout(() => {
        deliveryFetch(`/api/delivery/${resource}`, {
          signal: c.signal,
          cache: "no-store",
        })
          .then(async (r) => {
            const v = await r.json();
            if (!r.ok) throw new Error(v.error ?? "Could not load messages.");
            if (!c.signal.aborted) setState({ resource, data: v });
          })
          .catch((e) => {
            if (!c.signal.aborted) setState({ resource, error: e.message });
          });
      }, 200);
    return () => {
      clearTimeout(timer);
      c.abort();
    };
  }, [resource]);
  return state?.resource === resource ? state : {};
}
export function PartnerMessageButton({
  partner,
  invoice,
  changed,
}: {
  partner?: Partner;
  invoice?: { id: string; publicId: string; total: number; paid: number };
  changed?: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        {invoice ? <BellRing size={15} /> : <MessageSquare size={15} />}
        {invoice ? "Remind payment" : "Message partner"}
      </Button>
      {open && (
        <Composer
          initialPartner={partner}
          initialInvoice={invoice}
          close={() => setOpen(false)}
          changed={changed}
        />
      )}
    </>
  );
}
export function AdminMessageButton({ changed }: { changed?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <MessageSquare size={15} />
        Message admin
      </Button>
      {open && (
        <Composer toAdmin close={() => setOpen(false)} changed={changed} />
      )}
    </>
  );
}
function Composer({
  initialPartner,
  initialInvoice,
  close,
  changed,
  toAdmin = false,
}: {
  initialPartner?: Partner;
  initialInvoice?: {
    id: string;
    publicId: string;
    total: number;
    paid: number;
  };
  close: () => void;
  changed?: () => void;
  toAdmin?: boolean;
}) {
  const [partner, setPartner] = useState(initialPartner),
    [search, setSearch] = useState(""),
    [title, setTitle] = useState(initialInvoice ? "Payment reminder" : ""),
    [message, setMessage] = useState(""),
    [invoice, setInvoice] = useState(initialInvoice),
    [invoiceSearch, setInvoiceSearch] = useState(""),
    [reminder, setReminder] = useState(!!initialInvoice),
    [review, setReview] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const key = useRef<string | null>(null),
    locked = useRef(false);
  const partners = useMessageData<Partner[]>(
    !toAdmin && !partner
      ? `finance-partners?q=${encodeURIComponent(search)}`
      : null,
  );
  const invoices = useMessageData<FinanceList>(
    partner && reminder && !invoice
      ? `finance?partnerId=${partner.id}&tab=invoices&status=OUTSTANDING&q=${encodeURIComponent(invoiceSearch)}`
      : null,
  );
  function edit() {
    setReview(false);
    key.current = null;
    setError("");
  }
  async function send() {
    if (locked.current || (!toAdmin && !partner)) return;
    locked.current = true;
    setBusy(true);
    setError("");
    key.current ??= crypto.randomUUID();
    try {
      const r = await deliveryFetch("/api/delivery/commands", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": key.current,
        },
        body: JSON.stringify(
          toAdmin
            ? { type: "sendAdminMessage", title, message }
            : {
                type: "sendPartnerMessage",
                partnerId: partner!.id,
                title: reminder ? "Payment reminder" : title,
                message,
                ...(reminder && invoice ? { invoiceId: invoice.id } : {}),
              },
        ),
      });
      const v = await r.json();
      if (!r.ok) throw new Error(v.error ?? "Could not send this message.");
      toast.success(v.message);
      changed?.();
      close();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Check your connection and retry.",
      );
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  const valid =
    (toAdmin || !!partner) &&
    (reminder
      ? !!invoice
      : title.trim().length >= 3 && message.trim().length >= 5);
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v && !busy) close();
      }}
    >
      <DialogContent className="d-message-composer" showCloseButton={!busy}>
        <DialogHeader>
          <DialogTitle>
            {review
              ? "Review message"
              : toAdmin
                ? "Message admin"
                : reminder
                  ? "Payment reminder"
                  : "Message partner"}
          </DialogTitle>
          <DialogDescription>
            {toAdmin
              ? "iGO Delivery administration"
              : (partner?.businessName ?? "Choose a business")}
          </DialogDescription>
        </DialogHeader>
        {review ? (
          <div className="d-message-preview">
            <h3>
              {reminder ? `Payment reminder · ${invoice?.publicId}` : title}
            </h3>
            {reminder && (
              <p>
                {invoice?.publicId} · {money(invoice!.total - invoice!.paid)}{" "}
                outstanding
              </p>
            )}
            <p className="d-message-body">{message}</p>
            <p>
              {toAdmin ? "Admin" : "Partner"} inbox · browser alerts if enabled.
            </p>
          </div>
        ) : (
          <>
            {!partner && !toAdmin ? (
              <div className="d-message-choices">
                <Label htmlFor="partner-search">Partner</Label>
                <Input
                  id="partner-search"
                  placeholder="Search businesses…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                {partners.error && <p role="alert">{partners.error}</p>}
                {partners.data?.map((p) => (
                  <Button
                    key={p.id}
                    variant="outline"
                    onClick={() => setPartner(p)}
                  >
                    {p.businessName}
                  </Button>
                ))}
                {partners.data?.length === 0 && <p>No matching businesses</p>}
              </div>
            ) : (
              <>
                {!initialPartner && !toAdmin && (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setPartner(undefined);
                      setInvoice(undefined);
                    }}
                  >
                    Change partner
                  </Button>
                )}
                {!initialInvoice && !toAdmin && (
                  <div className="d-row-actions">
                    <Button
                      variant={!reminder ? "default" : "outline"}
                      onClick={() => setReminder(false)}
                    >
                      Message
                    </Button>
                    <Button
                      variant={reminder ? "default" : "outline"}
                      onClick={() => setReminder(true)}
                    >
                      Payment reminder
                    </Button>
                  </div>
                )}
                {reminder ? (
                  invoice ? (
                    <div className="d-message-invoice">
                      <strong>{invoice.publicId}</strong>
                      <span>
                        {money(invoice.total - invoice.paid)} outstanding
                      </span>
                      {!initialInvoice && (
                        <Button
                          variant="ghost"
                          onClick={() => setInvoice(undefined)}
                        >
                          Change invoice
                        </Button>
                      )}
                    </div>
                  ) : (
                    <div className="d-message-choices">
                      <Label htmlFor="reminder-invoice">
                        Outstanding invoice
                      </Label>
                      <Input
                        id="reminder-invoice"
                        placeholder="Search invoice number…"
                        value={invoiceSearch}
                        onChange={(e) => setInvoiceSearch(e.target.value)}
                      />
                      {invoices.error && <p role="alert">{invoices.error}</p>}
                      {(
                        invoices.data?.items as FinanceInvoice[] | undefined
                      )?.map((i) => (
                        <Button
                          variant="outline"
                          key={i.id}
                          onClick={() => setInvoice(i)}
                        >
                          {i.publicId} · {money(i.total - i.paid)}
                        </Button>
                      ))}
                      {invoices.data?.total === 0 && (
                        <p>No outstanding invoices</p>
                      )}
                    </div>
                  )
                ) : (
                  <>
                    <Label htmlFor="message-title">Title</Label>
                    <Input
                      id="message-title"
                      value={title}
                      maxLength={100}
                      onChange={(e) => setTitle(e.target.value)}
                    />
                  </>
                )}
                <Label htmlFor="partner-message">
                  {reminder ? "Additional message (optional)" : "Message"}
                </Label>
                <textarea
                  id="partner-message"
                  rows={4}
                  maxLength={1000}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="d-message-input"
                />
              </>
            )}
          </>
        )}
        {error && (
          <p className="d-error" role="alert">
            {error}
          </p>
        )}
        <div className="d-row-actions">
          {review ? (
            <>
              <Button variant="outline" disabled={busy} onClick={edit}>
                Edit
              </Button>
              <Button disabled={busy} onClick={() => void send()}>
                {busy ? "Sending…" : "Send notification"}
              </Button>
            </>
          ) : (
            <Button disabled={!valid} onClick={() => setReview(true)}>
              Review message
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
type Sent = {
  id: string;
  createdAt: string;
  detail: {
    title: string;
    message: string;
    businessName: string;
    invoiceId?: string;
  };
};
export function SentMessages({
  revision,
  period = "",
  toAdmin = false,
}: {
  revision: number;
  period?: string;
  toAdmin?: boolean;
}) {
  const [page, setPage] = useState(1),
    [selected, setSelected] = useState<Sent>();
  const state = useMessageData<{ items: Sent[]; total: number }>(
    `${toAdmin ? "sent-admin-messages" : "admin-messages"}?page=${page}&revision=${revision}&${period}`,
  );
  return (
    <section className="d-card d-sent-messages">
      <header className="d-card-header">
        <h2>{toAdmin ? "Sent to admin" : "Sent to partners"}</h2>
      </header>
      {state.error && (
        <p role="alert" className="d-error">
          {state.error}
        </p>
      )}
      {state.data ? (
        state.data.items.length ? (
          state.data.items.map((s) => (
            <button
              className="d-sent-message-button"
              key={s.id}
              onClick={() => setSelected(s)}
            >
              <strong>{s.detail.title}</strong>
              <span>
                {toAdmin
                  ? "iGO Delivery administration"
                  : s.detail.businessName}
              </span>
              <time>
                {new Date(s.createdAt).toLocaleString("en-GB", {
                  timeZone: "Indian/Maldives",
                })}{" "}
                MVT
              </time>
            </button>
          ))
        ) : (
          <p className="d-finance-empty">No messages sent yet</p>
        )
      ) : (
        !state.error && <p role="status">Loading…</p>
      )}
      <div className="d-row-actions">
        <Button
          variant="ghost"
          aria-label="Previous sent messages"
          disabled={page === 1}
          onClick={() => setPage((p) => p - 1)}
        >
          <ChevronLeft size={16} />
        </Button>
        <span>Page {page}</span>
        <Button
          variant="ghost"
          aria-label="Next sent messages"
          disabled={!state.data || page * 10 >= state.data.total}
          onClick={() => setPage((p) => p + 1)}
        >
          <ChevronRight size={16} />
        </Button>
      </div>
      <Dialog
        open={!!selected}
        onOpenChange={(v) => {
          if (!v) setSelected(undefined);
        }}
      >
        <DialogContent className="d-notification-dialog">
          <DialogHeader>
            <DialogTitle>{selected?.detail.title}</DialogTitle>
            <DialogDescription>
              {toAdmin
                ? "iGO Delivery administration"
                : selected?.detail.businessName}
            </DialogDescription>
          </DialogHeader>
          <p className="d-message-body">{selected?.detail.message}</p>
          {selected?.detail.invoiceId && (
            <Button
              render={
                <a
                  href={`/delivery/finance?invoiceId=${selected.detail.invoiceId}`}
                />
              }
            >
              Open invoice
            </Button>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
