import type { Metadata, Viewport } from "next";
import "../rider.css";
export const metadata: Metadata = {
  title: "iGO Rider — Your next delivery",
  manifest: "/rider.webmanifest",
  appleWebApp: { capable: true, title: "iGO Rider", statusBarStyle: "default" },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
