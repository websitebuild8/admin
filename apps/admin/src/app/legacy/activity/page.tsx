import { Suspense } from "react";
import { ActivityPage } from "@/components/workspace-pages";
export default function Page() { return <Suspense fallback={<p>Loading workspace…</p>}><ActivityPage/></Suspense>; }
