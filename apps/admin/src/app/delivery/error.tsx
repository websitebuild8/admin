"use client";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
export default function DeliveryErrorPage({ retry }: { retry: () => void }) {
  return (
    <main className="d-application">
      <section className="d-application-card">
        <span className="d-eyebrow">DELIVERY WORKSPACE</span>
        <h1>Let’s reconnect.</h1>
        <p>
          We couldn’t load the workspace. Check your connection and try again.
          If an action was interrupted, check its status before submitting it
          again.
        </p>
        <div className="d-row-actions mt-6">
          <Button onClick={retry}>
            <RefreshCw size={16} /> Try again
          </Button>
          <Link href="/">Back to iGO Delivery</Link>
        </div>
      </section>
    </main>
  );
}
