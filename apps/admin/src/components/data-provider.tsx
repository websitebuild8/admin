'use client';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { createDemoState } from '@/lib/demo-data';
import { applyCommand, stateSchema, type Command, type State } from '@/lib/domain';

type Data = { state: State | null; demo: boolean; localDemo: boolean; sandboxId: string | null; selectSandbox: (id: string | null) => void; error: string | null; execute: (command: Command) => Promise<boolean>; refresh: () => void; reset: () => void; busy: boolean };
const Context = createContext<Data | null>(null);
const storageKey = 'igo-admin-demo-v2', sessionKey = 'igo-admin-shared-demo';
export function DataProvider({ children, demo: localDemo }: { children: React.ReactNode; demo: boolean }) {
  const [state, setState] = useState<State | null>(null);
  const [sandboxId, setSandboxId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const revision = useRef(0);
  const demo = localDemo || sandboxId !== null;
  const selectSandbox = useCallback((id: string | null) => {
    revision.current++; setState(null); setError(null); setSandboxId(id);
    if (id) localStorage.setItem(sessionKey, id); else localStorage.removeItem(sessionKey);
  }, []);
  // Hydrate only the session ID. The access key is never persisted in the browser.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (!localDemo) setSandboxId(localStorage.getItem(sessionKey)); setReady(true); }, [localDemo]);
  const refresh = useCallback(async () => {
    if (!ready) return;
    const current = ++revision.current;
    try {
      let next: State;
      if (localDemo) {
        next = createDemoState();
        try { const saved = localStorage.getItem(storageKey); if (saved) next = stateSchema.parse(JSON.parse(saved)); } catch { toast.info('Browser preview reset.'); }
      } else {
        const response = await fetch(sandboxId ? `/api/admin/demo?id=${encodeURIComponent(sandboxId)}` : '/api/admin/state', { cache: 'no-store' });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? 'Could not load workspace.');
        next = stateSchema.parse(sandboxId ? body.state : body);
      }
      if (current === revision.current) { setState(next); setError(null); }
    } catch (e) { if (current === revision.current) { setState(null); setError(e instanceof Error ? e.message : 'Unable to load workspace.'); } }
  }, [ready, localDemo, sandboxId]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (!sandboxId) return;
    const timer = setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, 5000);
    return () => clearInterval(timer);
  }, [sandboxId, refresh]);
  async function execute(command: Command) {
    if (!state || busy) return false;
    setBusy(true);
    const current = ++revision.current;
    try {
      let next: State;
      if (localDemo) {
        const saved = localStorage.getItem(storageKey);
        next = applyCommand(saved ? stateSchema.parse(JSON.parse(saved)) : state, command, 'Demo admin');
        localStorage.setItem(storageKey, JSON.stringify(next));
      } else {
        const response = await fetch(sandboxId ? '/api/admin/demo' : '/api/admin/actions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sandboxId ? { action: 'command', id: sandboxId, command } : command) });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? 'The change could not be saved.');
        next = stateSchema.parse(sandboxId ? body.state : body);
      }
      if (current === revision.current) setState(next);
      toast.success(command.type === 'request-refund' ? 'Refund review requested. No money has been moved.' : 'Changes saved');
      return true;
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Unable to save changes.'); return false; }
    finally { setBusy(false); }
  }
  async function reset() {
    if (!demo || busy) return;
    const current = ++revision.current;
    if (localDemo) { localStorage.removeItem(storageKey); setState(createDemoState()); }
    else {
      setBusy(true);
      try {
        const response = await fetch('/api/admin/demo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'reset', id: sandboxId }) });
        const body = await response.json(); if (!response.ok) throw new Error(body.error);
        if (current === revision.current) setState(stateSchema.parse(body.state));
      } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not reset demo.'); return; }
      finally { setBusy(false); }
    }
    toast.success('Demo workspace reset');
  }
  return <Context.Provider value={{ state, demo, localDemo, sandboxId, selectSandbox, error, execute, refresh, reset, busy }}>{children}</Context.Provider>;
}
export function useData() { const value = useContext(Context); if (!value) throw new Error('Missing data provider'); return value; }
