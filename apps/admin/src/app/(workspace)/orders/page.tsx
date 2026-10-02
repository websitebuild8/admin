import { Suspense } from "react";
import { OrdersPage } from "@/components/workspace-pages";
export default function Page() { return <Suspense fallback={<p>Loading workspace…</p>}><OrdersPage/></Suspense>; }
