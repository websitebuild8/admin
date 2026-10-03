'use client';
import Script from 'next/script';
import { useEffect, useRef, useState } from 'react';
import type { Rider } from '@/lib/domain';
type Marker = {setMap:(map:unknown)=>void};
type Maps = {Map:new (element:HTMLElement,options:object)=>unknown;Marker:new(options:object)=>Marker};
export function AdminMap({riders,now}:{riders:Rider[];now:number}){
  const key=process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
  const [ready,setReady]=useState(false);const [error,setError]=useState(false);
  const element=useRef<HTMLDivElement>(null);const map=useRef<unknown>(null);
  useEffect(()=>{
    if(!ready||!element.current)return;
    const maps=(window as unknown as {google?:{maps:Maps}}).google?.maps;
    if(!maps)return;
    if(!map.current)map.current=new maps.Map(element.current,{center:{lat:4.20,lng:73.525},zoom:12,mapTypeControl:false,streetViewControl:false,restriction:{latLngBounds:{north:4.27,south:4.15,east:73.57,west:73.48},strictBounds:true}});
    const markers=riders.filter(r=>r.status==='Active'&&r.online&&r.location&&now-Date.parse(r.location.receivedAt)<=120000).map(r=>new maps.Marker({map:map.current,position:{lat:r.location!.lat,lng:r.location!.lng},title:r.name,label:r.initials}));
    return()=>markers.forEach(m=>m.setMap(null));
  },[ready,riders,now]);
  if(!key)return <section className="panel" style={{padding:24}}><h2>Admin tracking map</h2><p>Google Maps is not connected. Add the restricted Google Maps browser key to enable the map. Latest coordinates remain visible below.</p></section>;
  return <section className="panel"><Script src={`https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}`} onReady={()=>setReady(true)} onError={()=>setError(true)}/>{error&&<p role="alert">Map unavailable. Use the location list below.</p>}<div ref={element} aria-label="Admin-only rider map" style={{height:360,borderRadius:16}}/></section>;
}
