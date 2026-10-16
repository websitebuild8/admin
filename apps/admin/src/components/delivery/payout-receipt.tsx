"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Printer,
  ReceiptText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { money, type Actor } from "@/lib/delivery/domain";
import type {
  CodReceiptDocument,
  CodReceiptSnapshot,
} from "@/lib/delivery/cod-receipt-contract";
import { DeliverySkeleton } from "./skeleton";

const stamp = (value: string) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Indian/Maldives",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
type Receipt = CodReceiptDocument["receipt"];
type Line = CodReceiptSnapshot["lines"][number];
function ReceiptLines({ items }: { items: Line[] }) {
  return (
    <div className="cod-receipt-lines">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Package / reference</TableHead>
            <TableHead>Recipient</TableHead>
            <TableHead>Delivered · MVT</TableHead>
            <TableHead className="text-right">COD amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((line) => (
            <TableRow key={line.id}>
              <TableCell>
                <strong>{line.publicId}</strong>
                <small>{line.externalReference}</small>
              </TableCell>
              <TableCell>{line.recipientName}</TableCell>
              <TableCell>{stamp(line.deliveredAt)}</TableCell>
              <TableCell className="text-right">{money(line.amount)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
function ReceiptBody({
  receipt: r,
  items,
  partner,
  allItems,
}: {
  receipt: Receipt;
  items: Line[];
  partner: boolean;
  allItems?: Line[];
}) {
  return (
    <article className="cod-receipt" aria-label="COD payout receipt">
      <header>
        <div>
          <Image
            src="/brand/igo-delivery.jpg"
            width={100}
            height={56}
            alt="iGO Delivery"
          />
          <p>You order. I go.</p>
        </div>
        <div>
          <span className="cod-receipt-status">
            {partner ? "Received" : "Remitted to partner"}
          </span>
          <h2>COD payout receipt</h2>
          <p className="cod-receipt-number">{r.number}</p>
        </div>
      </header>
      <div className="cod-receipt-parties">
        <section>
          <span>FROM</span>
          <h3>{r.issuer.legalName || r.issuer.brand}</h3>
          {r.issuer.registrationNumber && (
            <p>Reg. {r.issuer.registrationNumber}</p>
          )}
          {r.issuer.supportPhone && <p>{r.issuer.supportPhone}</p>}
          {r.issuer.supportEmail && <p>{r.issuer.supportEmail}</p>}
        </section>
        <section>
          <span>PAID TO</span>
          <h3>{r.partner.businessName}</h3>
          <p>
            {r.partner.contactName} · {r.partner.phone}
          </p>
          <p>
            {r.partner.address}, {r.partner.area}
          </p>
        </section>
      </div>
      <dl className="cod-receipt-facts">
        <div>
          <dt>Bank payout reference</dt>
          <dd>{r.reference}</dd>
        </div>
        <div>
          <dt>Payout recorded · MVT</dt>
          <dd>{stamp(r.recordedAt)}</dd>
        </div>
        <div>
          <dt>Receipt issued · MVT</dt>
          <dd>{stamp(r.issuedAt)}</dd>
        </div>
        <div>
          <dt>Packages included</dt>
          <dd>{r.packageCount}</dd>
        </div>
      </dl>
      <div className="cod-receipt-amount">
        <span>{partner ? "Amount received" : "Amount remitted"}</span>
        <strong>{money(r.amount)}</strong>
        <small>Currency: {r.currency}</small>
      </div>
      <div className={allItems ? "cod-screen-only" : ""}>
        <ReceiptLines items={items} />
      </div>
      {allItems && (
        <div className="cod-print-only">
          <ReceiptLines items={allItems} />
        </div>
      )}
      <footer>
        <strong>Recorded and verified by iGO administration.</strong>
        <p>
          This receipt covers the recipient collections for the packages listed.
          Delivery-fee invoices and their balances remain separate.
        </p>
        <p>
          Business profile details are saved at receipt issuance. All times are
          Maldives Time (UTC+5).
        </p>
      </footer>
    </article>
  );
}
function ReceiptPager({
  page,
  total,
  onPage,
}: {
  page: number;
  total: number;
  onPage: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / 10));
  return total > 10 ? (
    <div className="cod-receipt-pager">
      <span>
        Page {page} of {pages} · 10 packages per page
      </span>
      <div>
        <Button
          size="icon"
          variant="outline"
          aria-label="Previous receipt page"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          <ChevronLeft size={17} />
        </Button>
        <Button
          size="icon"
          variant="outline"
          aria-label="Next receipt page"
          disabled={page >= pages}
          onClick={() => onPage(page + 1)}
        >
          <ChevronRight size={17} />
        </Button>
      </div>
    </div>
  ) : null;
}
export function PayoutReceiptModal({
  id,
  actor,
  close,
}: {
  id: string;
  actor: Actor;
  close: () => void;
}) {
  const [page, setPage] = useState(1);
  const key = `${id}:${page}`;
  const [state, setState] = useState<{
    key: string;
    data?: CodReceiptDocument;
    error?: string;
  }>({ key: "" });
  useEffect(() => {
    const controller = new AbortController();
    fetch(
      `/api/delivery/cod-receipt?id=${encodeURIComponent(id)}&page=${page}`,
      { signal: controller.signal, cache: "no-store" },
    )
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok)
          throw new Error(result.error ?? "Could not load the payout receipt.");
        return result as CodReceiptDocument;
      })
      .then((data) => setState({ key, data }))
      .catch((error) => {
        if (!controller.signal.aborted)
          setState({
            key,
            error:
              error instanceof Error
                ? error.message
                : "Check your connection and retry.",
          });
      });
    return () => controller.abort();
  }, [id, page, key]);
  const current = state.key === key ? state : null;
  const partner = actor.role === "PARTNER";
  return (
    <Dialog
      open
      onOpenChange={(value) => {
        if (!value) close();
      }}
    >
      <DialogContent className="d-modal cod-receipt-modal">
        <DialogHeader>
          <DialogTitle>
            <ReceiptText size={19} />
            Payout receipt
          </DialogTitle>
          <DialogDescription>
            {partner
              ? "Your recorded COD payment and the packages it covers."
              : "The recorded partner payout and its package breakdown."}
          </DialogDescription>
        </DialogHeader>
        {current?.error ? (
          <div className="d-error" role="alert">
            {current.error}
          </div>
        ) : !current?.data ? (
          <DeliverySkeleton />
        ) : (
          <>
            <ReceiptBody
              receipt={current.data.receipt}
              items={current.data.items}
              partner={partner}
            />
            <ReceiptPager
              page={page}
              total={current.data.total}
              onPage={setPage}
            />
            <div className="cod-receipt-actions">
              <Button variant="outline" onClick={close}>
                Close
              </Button>
              <Button
                render={
                  <Link
                    href={`${partner ? "/partner" : "/delivery"}/payout-receipt/${id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  />
                }
              >
                <Printer size={16} />
                Print / save PDF
                <ArrowUpRight size={14} />
              </Button>
            </div>
            <p className="cod-receipt-print-hint">
              The print view includes every package in this payout.
            </p>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
export function PayoutReceiptPrint({
  document,
  partner,
}: {
  document: { receipt: Receipt; items: Line[] };
  partner: boolean;
}) {
  const [page, setPage] = useState(1);
  return (
    <main className="cod-print-page">
      <div className="cod-print-toolbar">
        <Link href={partner ? "/partner/cod" : "/delivery/cod"}>
          ← Back to cash flow
        </Link>
        <Button onClick={() => window.print()}>
          <Printer size={16} />
          Print / save PDF
        </Button>
      </div>
      <ReceiptBody
        receipt={document.receipt}
        items={document.items.slice((page - 1) * 10, page * 10)}
        allItems={document.items}
        partner={partner}
      />
      <ReceiptPager
        page={page}
        total={document.items.length}
        onPage={setPage}
      />
      <p className="cod-receipt-print-hint">
        Printing includes all {document.items.length} packages, across every
        page.
      </p>
    </main>
  );
}
