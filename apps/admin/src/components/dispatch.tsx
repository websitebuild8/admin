'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useData } from './data-provider';
import { PageHeading, DataBoundary } from './shared';
import { Button } from './ui/button';
import { PaginatedList } from './paginated-list';
import { OrderDetail } from './order-detail';
export function DispatchPage(){
  const {state,demo,refresh}=useData();
  const [selected,setSelected]=useState<string|null>(null);
  useEffect(()=>{const timer=setInterval(()=>{if(!demo)refresh();},15000);return()=>clearInterval(timer);},[demo,refresh]);
  if(!state)return <DataBoundary>{null}</DataBoundary>;
  return <><PageHeading title="Dispatch" description="Assign deliveries and follow restaurant and rider progress."><Button variant="outline" onClick={refresh}>Refresh</Button></PageHeading>
    <div className="policy-banner"><div><strong>Saved entrances, simple directions</strong><p>Available riders receive requests in their selected service area. Riders open Google Maps for directions. iGO does not collect live GPS locations.</p></div></div>
    <section className="panel section-gap"><div className="panel-heading"><h2>Available riders</h2></div><PaginatedList items={state.riders.filter(r=>r.status==='Active'&&r.online)} label="available riders">{riders=>riders.length ? riders.map(r=><div className="case-row" key={r.id}><div><strong>{r.name}</strong><p>{r.area} · {state.orders.some(o=>o.riderId===r.id&&o.status!=='Delivered') ? 'On a delivery' : 'Available for requests'}</p></div></div>) : <p className="empty-state">No online riders.</p>}</PaginatedList></section>
    <section className="panel section-gap"><div className="panel-heading"><h2>Active deliveries</h2></div><PaginatedList items={state.orders.filter(o=>o.status!=='Delivered')} label="deliveries">{orders=>orders.map(o=><div className="case-row" key={o.id}><div><strong>{o.id}</strong><p>{o.workflow.preparation} · {o.workflow.delivery}</p></div><Button variant="outline" onClick={()=>setSelected(o.id)}>Manage delivery</Button></div>)}</PaginatedList></section>
    <section className="panel section-gap"><div className="panel-heading"><h2>Status notifications & rider requests</h2></div><p style={{padding:'0 22px'}}>Persisted inbox events. Mobile push delivery is not connected yet.</p><PaginatedList items={state.notifications} label="notifications">{items=>items.length?items.map(n=><div className="case-row" key={n.id}><div><strong>{n.text}</strong><p>{n.recipient} · {n.orderId}</p></div></div>):<p className="empty-state">Confirm an order to generate updates.</p>}</PaginatedList></section><p className="muted section-gap">Change order preparation and rider progress in <Link href="/orders">Orders</Link>. The demo uses fictional orders.</p><OrderDetail id={selected} close={()=>setSelected(null)}/></>;
}
