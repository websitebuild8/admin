'use client';
import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useData } from './data-provider';
import type { Workflow } from '@/lib/fulfilment';
import { money } from '@/lib/domain';
import { eta, orderView } from '@/lib/workflow';
import { Status } from './shared';
import { PaginatedList } from './paginated-list';
export function OrderDetail({ id, close }: { id: string | null; close: () => void }) {
  const { state, execute, busy, demo } = useData();
  const [riderId, setRiderId] = useState('');
  const [now,setNow] = useState(()=>Date.now());
  useEffect(()=>{if(!id)return;const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[id]);
  const order = state?.orders.find(o => o.id === id);
  const restaurant = state?.restaurants.find(r => r.id === order?.restaurantId);
  const w = order?.workflow;
  const steps: Partial<Record<Workflow['delivery'], Workflow['delivery']>> = {'Order assigned':'Arrived at restaurant','Arrived at restaurant':'Order picked up','Order picked up':'Arrived at customer','Arrived at customer':'Delivery complete'};
  const nextDelivery = w && steps[w.delivery];
  return <Dialog open={!!order} onOpenChange={open => {if (!open) {setRiderId('');close();}}}>
    <DialogContent className="detail-dialog" style={{maxHeight:'90dvh',overflowY:'auto'}}>
      <DialogHeader><DialogTitle>{order?.id}</DialogTitle><DialogDescription>{restaurant?.name} · {order?.customer}</DialogDescription></DialogHeader>
      {order && w && state && <>
        <div className="detail-status"><Status value={order.status}/><strong>{money(order.amount)}</strong></div>
        <p>{order.items}</p><p className="muted">{order.address}</p>
        <small>{order.paid ? demo ? 'Simulated approval · no charge' : 'Verified BML card payment' : 'Payment not verified'} · {order.paymentRef}</small>
        <section className="detail-section"><h3>Restaurant preparation</h3><p>{w.preparation}</p>
          {w.preparation === 'Awaiting confirmation' && <Button disabled={busy || order.status === 'Needs attention'} onClick={()=>execute({type:'preparation',id:order.id,status:'Order confirmed'})}>Confirm order & alert available riders</Button>}
          {w.preparation === 'Order confirmed' && <Button disabled={busy} onClick={()=>execute({type:'preparation',id:order.id,status:'Ready for pickup'})}>Mark food ready for pickup</Button>}
        </section>
        <section className="detail-section"><h3>Rider progress</h3><p>{state.riders.find(r=>r.id===order.riderId)?.name ?? 'No rider assigned'} · {w.delivery}</p>
          {nextDelivery && <Button disabled={busy || (nextDelivery === 'Order picked up' && w.preparation !== 'Ready for pickup')} onClick={()=>execute({type:'delivery',id:order.id,status:nextDelivery})}>Mark {nextDelivery.toLowerCase()}</Button>}
          {w.delivery === 'Arrived at restaurant' && w.preparation === 'Ready for pickup' && <Button variant="outline" disabled={busy} onClick={()=>execute({type:'preparation',id:order.id,status:'Order picked up'})}>Record restaurant pickup confirmation</Button>}
          {!['On the way','Delivered','Needs attention','Awaiting restaurant'].includes(order.status) && <div className="inline-controls" style={{marginTop:12}}><Select value={riderId} onValueChange={v=>setRiderId(v??'')}><SelectTrigger><SelectValue placeholder="Assign / reassign rider">{state.riders.find(r=>r.id===riderId)?.name}</SelectValue></SelectTrigger><SelectContent>{state.riders.filter(r=>r.status==='Active' && r.online && r.documentsVerified && !state.orders.some(o=>o.riderId===r.id && o.status!=='Delivered')).map(r=><SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}</SelectContent></Select><Button disabled={busy||!riderId} onClick={async()=>{if(await execute({type:'assign-rider',id:order.id,riderId}))setRiderId('');}}>Assign</Button></div>}
        </section>
        {!order.riderId && ['Preparing','Ready for pickup'].includes(order.status) && <section className="detail-section"><h3>Service-area rider requests</h3><p>{w.wave ? `Request window ${w.wave} of 3` : 'Search not started'}</p><small>Online, available riders in the restaurant’s service area. Offers expire after 45 seconds. {demo ? 'Use the retry or assignment controls in this demo.' : 'Live scheduler checks each minute.'}</small>
          <PaginatedList items={w.offers} label="rider offers">{offers=>offers.map(f=><div className="case-row" key={f.riderId}><div>{state.riders.find(r=>r.id===f.riderId)?.name}<small style={{display:'block'}}>Offer expires {new Date(f.expiresAt).toLocaleTimeString('en-GB',{timeZone:'Indian/Maldives'})}</small></div>{demo && <Button disabled={busy||Date.parse(f.expiresAt)<=now} onClick={()=>execute({type:'accept-offer',id:order.id,riderId:f.riderId})}>Simulate acceptance</Button>}</div>)}</PaginatedList>
          {w.wave < 3 ? <Button variant="outline" disabled={busy||w.offers.some(f=>Date.parse(f.expiresAt)>now)} onClick={()=>execute({type:'dispatch',id:order.id})}>Send requests again</Button> : <p>No further search waves. Assign a rider manually.</p>}
        </section>}
        <section className="notice-box" style={{display:'block'}}><h3>Customer status preview · no live map</h3><p>{w.preparation} · {w.delivery}</p><strong>{eta(state,order,new Date(now).toISOString())}</strong><p className="muted">Distance-based estimate, not a live road-route or traffic estimate.</p></section>
        <section className="detail-section"><h3>Order timeline</h3><PaginatedList items={[...orderView(state,order,{role:'admin',id:'preview'}).events].reverse()} label="order events">{events=>events.length ? events.map((e,i)=><p key={i}>{e.text}<small className="muted" style={{display:'block'}}>{new Date(e.at).toLocaleString('en-GB',{timeZone:'Indian/Maldives'})}</small></p>) : <p className="muted">New workflow events will appear here.</p>}</PaginatedList></section>
        <small>{demo ? 'Demo controls simulate restaurant and rider actions. No push notifications are sent.' : 'Admin controls record supervised operational updates. Participant actions use the authenticated mobile API.'}</small>
      </>}
    </DialogContent>
  </Dialog>;
}
