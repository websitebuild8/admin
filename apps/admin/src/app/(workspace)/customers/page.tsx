import { Suspense } from "react";
import { CustomersPage } from "@/components/workspace-pages";
export default function Page() { return <Suspense fallback={<p>Loading workspace…</p>}><CustomersPage/></Suspense>; }
