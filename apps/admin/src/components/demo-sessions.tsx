'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { PageHeading, Status } from './shared';
import { PaginatedList } from './paginated-list';
import { useData } from './data-provider';
import { money } from '@/lib/domain';

type Session={id:string;createdAt:string;expiresAt:string};
type Payment={id:string;status:string;orderId:string|null;amount:number;createdAt:string};
async function api(data?:unknown,id?:string) {
  const r=await fetch(`/api/admin/demo${id?`?id=${encodeURIComponent(id)}`:''}`,{cache:'no-store',...(data?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}:{})});
  const body=await r.json();if(!r.ok) throw new Error(body.error??'Could not load demo.');return body;
}
export function DemoSessions() {
  const {sandboxId,selectSandbox,localDemo,busy:workspaceBusy}=useData();
  const [sessions,setSessions]=useState<Session[]>([]),[payments,setPayments]=useState<Payment[]>([]);
  const [join,setJoin]=useState<{id:string;key:string}|null>(null),[origin,setOrigin]=useState('');
  const [error,setError]=useState<string|null>(null),[busy,setBusy]=useState(false);
  const [ending,setEnding]=useState<string|null>(null);
  const load=useCallback(async()=>{
    if(localDemo)return;
    try { const list=await api();setSessions(list.sessions);setError(null);if(sandboxId){const current=await api(undefined,sandboxId);setPayments(current.payments);}else setPayments([]); }
    catch(e){setError(e instanceof Error?e.message:'Could not load sessions.');}
  },[localDemo,sandboxId]);
  useEffect(()=>{setOrigin(window.location.origin);void load();const timer=setInterval(()=>{if(document.visibilityState==='visible')void load();},5000);return()=>clearInterval(timer);},[load]);
  async function action(action:'create'|'rotate'|'end',id?:string) {
    setBusy(true);
    try {const result=await api({action,...(id?{id}:{})});if(action==='end'){if(sandboxId===id)selectSandbox(null);toast.success('Demo ended. Mobile access removed.');}else{setJoin(result);selectSandbox(result.id);}await load();}
    catch(e){toast.error(e instanceof Error?e.message:'Demo request failed.');}
    finally{setBusy(false);}
  }
  return <>
    <PageHeading title="Shared demo" description="Test checkout, kitchen and delivery together. Fictional orders; no card details, charges or payouts.">
      <Button disabled={localDemo||busy||workspaceBusy} onClick={()=>action('create')}>Create demo session</Button>
    </PageHeading>
    {localDemo?<section className="panel settings-panel"><p>Shared demos require the connected admin workspace, an approved Clerk administrator and the database migration. This browser preview stays local.</p></section>:<>
      {error&&<p role="alert">{error}</p>}
      {sandboxId&&<section className="panel settings-panel section-gap"><strong>Viewing shared demo {sandboxId.slice(0,8)}</strong><p>Every workspace page now shows only this session. Mobile changes refresh here every five seconds.</p><div className="dialog-actions"><Button variant="outline" disabled={busy||workspaceBusy} onClick={()=>selectSandbox(null)}>Return to real workspace</Button><Link href="/orders"><Button>View demo orders</Button></Link></div></section>}
      <section className="panel settings-panel section-gap"><h2>Demo sessions</h2><p className="muted">Up to ten active sessions. Each expires after seven days. Share the session key only with your testers.</p>
        <PaginatedList items={sessions} label="demo sessions">{page=><Table><TableHeader><TableRow><TableHead>Session</TableHead><TableHead>Expires</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader><TableBody>{page.map(s=><TableRow key={s.id}><TableCell>{s.id.slice(0,8)} {s.id===sandboxId&&<Status value="Selected"/>}</TableCell><TableCell>{new Date(s.expiresAt).toLocaleDateString()}</TableCell><TableCell><div className="dialog-actions"><Button variant="outline" disabled={busy||workspaceBusy} onClick={()=>selectSandbox(s.id)}>Open</Button><Button variant="outline" disabled={busy||workspaceBusy} onClick={()=>action('rotate',s.id)}>New join key</Button><Button variant="outline" disabled={busy||workspaceBusy} onClick={()=>setEnding(s.id)}>End</Button></div></TableCell></TableRow>)}</TableBody></Table>}</PaginatedList>
      </section>
      {sandboxId&&<section className="panel settings-panel section-gap"><h2>Demo bank attempts</h2><p className="muted">Approved means simulated approval. No money is collected.</p><PaginatedList items={payments} label="demo payments">{page=><Table><TableHeader><TableRow><TableHead>Attempt</TableHead><TableHead>Test amount</TableHead><TableHead>Result</TableHead><TableHead>Order</TableHead></TableRow></TableHeader><TableBody>{page.map(p=><TableRow key={p.id}><TableCell>{p.id.slice(0,8)}</TableCell><TableCell>{money(p.amount)}</TableCell><TableCell>{p.status}</TableCell><TableCell>{p.orderId??'No order submitted'}</TableCell></TableRow>)}</TableBody></Table>}</PaginatedList></section>}
    </>}
    <Dialog open={join!==null} onOpenChange={open=>{if(!open)setJoin(null);}}><DialogContent><DialogHeader><DialogTitle>Join your shared demo</DialogTitle><DialogDescription>On each phone, choose “Try shared demo”, enter the server address and key, then pick a fictional role. The same key connects all three roles to this session. Rotating it disconnects the previous key.</DialogDescription></DialogHeader>
      <Label htmlFor="demo-server">Server address</Label><Input id="demo-server" readOnly value={origin}/>
      <Label htmlFor="demo-key">Demo session key — shown once</Label><Textarea id="demo-key" readOnly value={join?.key??''}/>
      <p className="muted">For a phone, use a deployed HTTPS address. localhost on a phone points to the phone itself.</p>
      <Button onClick={async()=>{try{await navigator.clipboard.writeText(join?.key??'');toast.success('Demo key copied');}catch{toast.info('Select the key and copy it manually.');}}}>Copy key</Button>
    </DialogContent></Dialog>
    <Dialog open={ending!==null} onOpenChange={open=>{if(!open)setEnding(null);}}><DialogContent><DialogHeader><DialogTitle>End this demo session?</DialogTitle><DialogDescription>This deletes its fictional orders and payment attempts and removes mobile access. Real orders are unaffected.</DialogDescription></DialogHeader><div className="dialog-actions"><Button variant="outline" onClick={()=>setEnding(null)}>Keep session</Button><Button disabled={busy} onClick={async()=>{if(ending)await action('end',ending);setEnding(null);}}>End session</Button></div></DialogContent></Dialog>
  </>;
}
