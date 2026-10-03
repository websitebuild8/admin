'use client';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { createDemoState } from '@/lib/demo-data';
import { applyCommand, stateSchema, type Command, type State } from '@/lib/domain';

type Data = { state: State | null; demo: boolean; error: string | null; execute: (command: Command) => Promise<boolean>; refresh: () => void; reset: () => void; busy: boolean };
const Context = createContext<Data | null>(null);
const storageKey = 'igo-admin-demo-v2';
export function DataProvider({ children, demo }: { children: React.ReactNode; demo: boolean }) {
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    try {
      if (demo) {
        let next = createDemoState();
        try { const saved = localStorage.getItem(storageKey); if (saved) next = stateSchema.parse(JSON.parse(saved)); } catch { toast.info('Demo data was reset because the saved version could not be loaded.'); }
        setState(next);
      } else {
        const response = await fetch('/api/admin/state', { cache: 'no-store' });
        if (!response.ok) throw new Error('Could not load workspace. Check your admin access and database configuration.');
        setState(stateSchema.parse(await response.json()));
      }
      setError(null);
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to load workspace.'); }
  }, [demo]);
  // Hydrate from browser storage after SSR; this synchronizes an external store once.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void refresh(); }, [refresh]);
  async function execute(command: Command) {
    if (!state || busy) return false;
    setBusy(true);
    try {
      if (demo) {
        // Read the most recent persisted state to avoid stale actions across browser tabs.
        const saved = localStorage.getItem(storageKey);
        const latest = saved ? stateSchema.parse(JSON.parse(saved)) : state;
        const next = applyCommand(latest, command, 'Demo admin');
        localStorage.setItem(storageKey, JSON.stringify(next));
        setState(next);
      } else {
        const response = await fetch('/api/admin/actions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(command) });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? 'The change could not be saved.');
        setState(stateSchema.parse(body));
      }
      toast.success(command.type === 'request-refund' ? 'Refund review requested. No money has been moved.' : 'Changes saved');
      return true;
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Unable to save changes.'); return false; }
    finally { setBusy(false); }
  }
  function reset() { if (!demo) return; localStorage.removeItem(storageKey); setState(createDemoState()); toast.success('Demo workspace reset'); }
  return <Context.Provider value={{ state, demo, error, execute, refresh, reset, busy }}>{children}</Context.Provider>;
}
export function useData() { const value = useContext(Context); if (!value) throw new Error('Missing data provider'); return value; }
