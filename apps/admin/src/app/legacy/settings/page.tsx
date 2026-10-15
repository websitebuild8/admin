import { Suspense } from "react";
import { SettingsPage } from "@/components/workspace-pages";
export default function Page() { return <Suspense fallback={<p>Loading workspace…</p>}><SettingsPage/></Suspense>; }
