import { UserButton } from '@clerk/nextjs';
import { requireAdmin } from '@/lib/auth';
import { isDemoMode } from '@/lib/mode';
import { DataProvider } from '@/components/data-provider';
import { AdminShell } from '@/components/admin-shell';
export const dynamic = 'force-dynamic';
export default async function Layout({ children }: { children: React.ReactNode }) {
  const demo = isDemoMode();
  if (!demo) {
    try { await requireAdmin(); }
    catch { return <main className="setup-page"><div className="setup-card"><span className="brand">iGO</span><h1>Admin access required</h1><p>Your account has not been granted access to this workspace. Contact the workspace owner.</p><UserButton/></div></main>; }
  }
  return <DataProvider demo={demo}><AdminShell>{children}</AdminShell></DataProvider>;
}
