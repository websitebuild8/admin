import { Suspense } from "react";
import { PaymentsPage } from "@/components/workspace-pages";
export default function Page() { return <Suspense fallback={<p>Loading workspace…</p>}><PaymentsPage/></Suspense>; }
