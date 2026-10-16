import { PayoutReceiptPage } from "@/components/delivery/payout-receipt-page";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "COD payout receipt · iGO Delivery",
  robots: { index: false, follow: false },
};
export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return <PayoutReceiptPage params={params} partner />;
}
