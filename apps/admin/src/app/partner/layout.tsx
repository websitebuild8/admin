import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "iGO Partner — Your business workspace",
  icons: { apple: "/brand/igo-icon-192.png" },
  manifest: "/partner.webmanifest",
  appleWebApp: { capable: true, title: "iGO Partner", statusBarStyle: "default" },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
