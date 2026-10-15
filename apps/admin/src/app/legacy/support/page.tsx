import { Suspense } from "react";
import { SupportPage } from "@/components/workspace-pages";
export default function Page() { return <Suspense fallback={<p>Loading workspace…</p>}><SupportPage/></Suspense>; }
