import { Suspense } from "react";
import { PartnersPage } from "@/components/workspace-pages";
export default function Page() { return <Suspense fallback={<p>Loading workspace…</p>}><PartnersPage kind="restaurant"/></Suspense>; }
