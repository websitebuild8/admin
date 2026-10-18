"use client";
import { ThemeSwitcher } from "@/components/theme/switcher";
import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { money } from "@/lib/delivery/domain";
import type { InvoiceDocument } from "@/lib/delivery/invoice-document";
import { HistoryPager } from "./partner-history";
import type { PaidInvoiceProof } from "@/lib/delivery/paid-invoice-contract";

const stamp = (value: string) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Indian/Maldives",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
function Lines({ lines }: { lines: InvoiceDocument["lines"] }) {
  return (
    <div className="invoice-document-lines">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Package / reference</TableHead>
            <TableHead>Recipient</TableHead>
            <TableHead>Delivered (MVT)</TableHead>
            <TableHead>Fee (MVR)</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.map((line) => (
            <TableRow key={line.id}>
              <TableCell>
                <strong>{line.parcel.publicId}</strong>
                <small>{line.parcel.externalReference}</small>
              </TableCell>
              <TableCell>{line.parcel.recipientName}</TableCell>
              <TableCell>{stamp(line.parcel.deliveredAt)}</TableCell>
              <TableCell>{(line.amount / 100).toFixed(2)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
export function InvoicePrint({
  document,
  partner,
  paidProof,
}: {
  document: InvoiceDocument;
  partner: boolean;
  paidProof?: PaidInvoiceProof;
}) {
  const [page, setPage] = useState(1);
  const [paymentPage, setPaymentPage] = useState(1);
  const business = document.settings;
  return (
    <main className="invoice-print-page">
      <div className="invoice-print-toolbar">
        <Link href={partner ? "/partner/invoices" : "/delivery/invoices"}>
          ← Back to invoices
        </Link>
        <ThemeSwitcher inHeader />
        <Button onClick={() => window.print()}>
          <Printer size={16} /> Print / save PDF
        </Button>
      </div>
      <article className="invoice-document d-invoice-document">
        <header>
          <div>
            <Image
              src="/brand/igo-delivery.jpg"
              width={100}
              height={68}
              alt="iGO Delivery"
              unoptimized
            />
            <p>You order. I go.</p>
          </div>
          <div>
            <span
              className="invoice-document-status"
              data-payment-status={
                document.paid === document.total
                  ? "paid"
                  : document.paid
                    ? "partial"
                    : "due"
              }
            >
              {document.paid === document.total
                ? "Paid"
                : document.paid
                  ? "Partially paid"
                  : "Payment due"}
            </span>
            <h2>{paidProof ? "Paid delivery invoice" : "Delivery invoice"}</h2>
            <p className="invoice-document-number">{document.publicId}</p>
          </div>
        </header>
        <div className="invoice-document-parties">
          <section>
            <span>ISSUED BY</span>
            <h3>{business?.businessLegalName || "iGO Delivery"}</h3>
            {business?.registrationNumber && (
              <p>Registration: {business.registrationNumber}</p>
            )}
            <p>{business?.supportEmail}</p>
            <p>{business?.supportPhone}</p>
          </section>
          <section>
            <span>BILLED TO</span>
            <h3>{document.partner.businessName}</h3>
            <p>
              {document.partner.account.name} · {document.partner.account.phone}
            </p>
            <p>{document.partner.pickupAddress}</p>
          </section>
        </div>
        <dl className="invoice-document-facts">
          <div>
            <dt>Issued (MVT)</dt>
            <dd>{stamp(document.createdAt)}</dd>
          </div>
          <div>
            <dt>Invoice type</dt>
            <dd>
              {document.cycleDate
                ? `Daily · ${document.cycleDate}`
                : "Manual · completed deliveries"}
            </dd>
          </div>
          <div>
            <dt>Completed through (MVT)</dt>
            <dd>{stamp(document.cutoffAt)}</dd>
          </div>
          <div>
            <dt>Packages</dt>
            <dd>{document.lines.length}</dd>
          </div>
          {paidProof && (
            <>
              <div>
                <dt>Fully paid (MVT)</dt>
                <dd>{stamp(paidProof.paidAt)}</dd>
              </div>
              <div>
                <dt>Paid copy issued (MVT)</dt>
                <dd>{stamp(paidProof.issuedAt)}</dd>
              </div>
            </>
          )}
        </dl>
        <div className="invoice-screen-only">
          <Lines lines={document.lines.slice((page - 1) * 10, page * 10)} />
        </div>
        <div className="invoice-print-only">
          <Lines lines={document.lines} />
        </div>
        <div className="d-invoice-document-totals">
          <div>
            <span>Total delivery fees</span>
            <strong>{money(document.total)}</strong>
          </div>
          <div>
            <span>Confirmed payments</span>
            <strong>{money(document.paid)}</strong>
          </div>
          <div>
            <span>Outstanding on this invoice</span>
            <strong>{money(document.total - document.paid)}</strong>
          </div>
        </div>
        {paidProof && (
          <section className="d-paid-invoice-payments">
            <h3>Verified bank payments</h3>
            <div className="invoice-screen-only">
              <PaidPayments
                payments={paidProof.payments.slice(
                  (paymentPage - 1) * 10,
                  paymentPage * 10,
                )}
              />
              <HistoryPager
                page={paymentPage}
                total={paidProof.payments.length}
                onPage={setPaymentPage}
              />
            </div>
            <div className="invoice-print-only">
              <PaidPayments payments={paidProof.payments} />
            </div>
          </section>
        )}
        <footer>
          <p>
            Delivery fees only. Earlier unpaid invoices remain due. A submitted
            bank receipt reduces the balance only after admin verification.
          </p>
          {!paidProof && business?.bankAccount && (
            <p>
              Bank transfer: {business.bankName} · {business.beneficiary} ·{" "}
              {business.bankAccount}. Use {document.publicId} as the reference.
            </p>
          )}
          <p>
            {paidProof
              ? `Paid copy issued ${stamp(paidProof.issuedAt)} MVT. This document preserves the verified settlement details at issuance.`
              : `Generated ${stamp(document.generatedAt)} MVT. Payment balances are current at the time this document is opened.`}
          </p>
        </footer>
      </article>
      <div className="invoice-screen-only">
        <HistoryPager
          page={page}
          total={document.lines.length}
          onPage={setPage}
        />
      </div>
      <p className="invoice-document-print-hint">
        Printing includes all {document.lines.length} packages, across every
        page.
      </p>
    </main>
  );
}
function PaidPayments({
  payments,
}: {
  payments: PaidInvoiceProof["payments"];
}) {
  return (
    <div className="invoice-document-lines">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Bank reference</TableHead>
            <TableHead>Verified (MVT)</TableHead>
            <TableHead>Confirmed (MVR)</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {payments.map((payment) => (
            <TableRow key={payment.id}>
              <TableCell>{payment.bankReference}</TableCell>
              <TableCell>{stamp(payment.reviewedAt)}</TableCell>
              <TableCell>{(payment.amount / 100).toFixed(2)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
