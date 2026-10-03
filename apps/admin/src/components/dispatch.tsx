'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useData } from './data-provider';
import { PageHeading, DataBoundary } from './shared';
import { Button } from './ui/button';
import { PaginatedList } from './paginated-list';
import { OrderDetail } from './order-detail';
import { AdminMap } from './tracking-map';
export function DispatchPage(){
  const {state,demo,execute,busy,refresh}=useData();
  const [selected,setSelected]=useState<string|null>(null);
  const [now,setNow]=useState(()=>Date.now());
  useEffect(()=>{const timer=setInterval(()=>{setNow(Date.now());if(!demo)refresh();},15000);return()=>clearInterval(timer);},[demo,refresh]);
  if(!state)return <DataBoundary>{null}</DataBoundary>;
  return <><PageHeading title="Dispatch & rider locations" description="Location visibility is restricted to administrators."><Button variant="outline" onClick={refresh}>Refresh</Button></PageHeading>
    <div className="policy-banner"><div><strong>{demo?'Simulated rider positions':'Latest reported rider positions'}</strong><p>Restaurants and customers receive status updates and delivery estimates only. Locations older than two minutes are marked stale.</p></div></div>
    <AdminMap riders={state.riders} now={now}/>
    <section className="panel section-gap"><div className="panel-heading"><h2>Rider locations</h2></div><PaginatedList items={state.riders.filter(r=>r.status==='Active'&&r.online)} label="rider locations">{riders=>riders.map(r=><div className="case-row" key={r.id}><div><strong>{r.name}</strong><p>{r.location ? `${r.location.lat.toFixed(5)}, ${r.location.lng.toFixed(5)} · ±${r.location.accuracy} m`:'Location not reported'}</p><small>{r.location ? `${Math.max(0,Math.round((now-Date.parse(r.location.receivedAt))/1000))} seconds ago · ${now-Date.parse(r.location.receivedAt)>120000?'Stale':'Recent'}`:'Unavailable'}</small></div>{demo&&r.location&&<Button disabled={busy} variant="outline" onClick={()=>execute({type:'location',riderId:r.id,point:{lat:r.location!.lat,lng:r.location!.lng},accuracy:10,capturedAt:new Date().toISOString(),sequence:r.location!.sequence+1})}>Simulate fresh GPS</Button>}</div>)}</PaginatedList></section>
    <section className="panel section-gap"><div className="panel-heading"><h2>Active deliveries</h2></div><PaginatedList items={state.orders.filter(o=>o.status!=='Delivered')} label="deliveries">{orders=>orders.map(o=><div className="case-row" key={o.id}><div><strong>{o.id}</strong><p>{o.workflow.preparation} · {o.workflow.delivery}</p></div><Button variant="outline" onClick={()=>setSelected(o.id)}>Manage delivery</Button></div>)}</PaginatedList></section>
    <section className="panel section-gap"><div className="panel-heading"><h2>Status notifications & rider requests</h2></div><p style={{padding:'0 22px'}}>Persisted inbox events. Mobile push delivery is not connected yet.</p><PaginatedList items={state.notifications} label="notifications">{items=>items.length?items.map(n=><div className="case-row" key={n.id}><div><strong>{n.text}</strong><p>{n.recipient} · {n.orderId}</p></div></div>):<p className="empty-state">Confirm an order to generate updates.</p>}</PaginatedList></section><p className="muted section-gap">Change order preparation and rider progress in <Link href="/orders">Orders</Link>. The demo uses fictional coordinates.</p><OrderDetail id={selected} close={()=>setSelected(null)}/></>;
}
