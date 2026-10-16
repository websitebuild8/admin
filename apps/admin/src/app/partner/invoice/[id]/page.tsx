import { InvoicePage } from "@/components/delivery/invoice-page";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Delivery invoice · iGO Delivery",
  robots: { index: false, follow: false },
};
export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return <InvoicePage params={params} partner />;
}
