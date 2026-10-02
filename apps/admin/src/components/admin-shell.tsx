'use client';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { UserButton } from '@clerk/nextjs';
import { ArrowUpRight, Bell, Bike, CircleHelp, ClipboardList, CreditCard, LayoutDashboard, Menu, Search, Settings2, Store, Users, Activity, ChevronRight, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { useData } from './data-provider';
import { useState } from 'react';

export const navigation = [
  { href: '/', label: 'Overview', icon: LayoutDashboard },
  { href: '/orders', label: 'Orders', icon: ClipboardList },
  { href: '/restaurants', label: 'Restaurants', icon: Store },
  { href: '/riders', label: 'Riders', icon: Bike },
  { href: '/customers', label: 'Customers', icon: Users },
  { href: '/payments', label: 'Payments', icon: CreditCard },
  { href: '/support', label: 'Support', icon: CircleHelp },
];
function Nav({ close }: { close?: () => void }) {
  const path = usePathname(); const { state, demo } = useData();
  return <div className="nav-inner"><div className="workspace-label"><Image className="workspace-logo" src="/brand/igo-logo.jpg" alt="" width={36} height={36}/><div>{state?.settings.businessName ?? 'iGO'} workspace<small>Administration</small></div><ChevronRight size={15}/></div><p className="nav-caption">WORKSPACE</p><nav>{navigation.map(({ href, label, icon: Icon }) => <Link key={href} href={href} onClick={close} className={`nav-item ${path === href ? 'active' : ''}`}><Icon size={19}/><span>{label}</span>{label === 'Orders' && state && <span className="nav-count">{state.orders.filter(o => o.status !== 'Delivered').length}</span>}{label === 'Support' && !!state?.tickets.filter(t => t.status === 'Open').length && <span className="notification-dot"/>}</Link>)}</nav><p className="nav-caption second">MANAGEMENT</p><Link onClick={close} href="/activity" className={`nav-item ${path === '/activity' ? 'active' : ''}`}><Activity size={19}/>Activity log</Link><Link onClick={close} href="/settings" className={`nav-item ${path === '/settings' ? 'active' : ''}`}><Settings2 size={19}/>Settings</Link><div className="nav-bottom"><div className="region-card"><MapPin size={19}/><strong>Made for your islands.</strong><p>Malé & Hulhumalé</p><span>One city. A little closer.</span></div><div className="profile"><span className="avatar black">IG</span><div><strong>{demo ? 'Demo administrator' : 'Administrator'}</strong><small>{demo ? 'Explore your workspace' : 'Authorized workspace access'}</small></div>{!demo && <UserButton/>}</div></div></div>;
}
export function AdminShell({ children }: { children: React.ReactNode }) {
  const { state, demo } = useData(); const path = usePathname(); const [open, setOpen] = useState(false); const [query, setQuery] = useState('');
  const matches = query.trim() ? state?.orders.filter(o => `${o.id} ${o.customer}`.toLowerCase().includes(query.toLowerCase())).slice(0, 5) : [];
  const title = [...navigation, { href: '/settings', label: 'Settings' }, { href: '/activity', label: 'Activity log' }].find(n => n.href === path)?.label ?? 'Workspace';
  return <div className="app-shell"><aside className="sidebar"><Nav/></aside><div className="main-shell"><header className="topbar"><div className="breadcrumbs"><Sheet open={open} onOpenChange={setOpen}><SheetTrigger render={<Button variant="ghost" size="icon" className="mobile-menu" aria-label="Open navigation"/>}><Menu size={20}/></SheetTrigger><SheetContent side="left" className="mobile-nav"><SheetTitle className="sr-only">Navigation</SheetTitle><Nav close={() => setOpen(false)}/></SheetContent></Sheet><span>Workspace</span><ChevronRight size={13}/><strong>{title}</strong></div><div className="topbar-actions"><div className="global-search"><Search size={16}/><Input aria-label="Search orders or customers" placeholder="Search orders, customers..." value={query} onChange={e => setQuery(e.target.value)}/>{query && <div className="search-results">{matches?.length ? matches.map(o => <Link href={`/orders?order=${o.id}`} key={o.id} onClick={() => setQuery('')}><strong>{o.id}</strong><span>{o.customer}</span><ArrowUpRight size={14}/></Link>) : <p>No matching orders</p>}</div>}</div><Link href="/activity" className="icon-button" aria-label="View recent activity"><Bell size={19}/>{!!state?.activity.length && <i/>}</Link><div className="top-divider"/><Image className="header-logo" src="/brand/igo-logo.jpg" alt="iGO" width={38} height={38}/></div></header>{demo && <div className="demo-strip"><span className="demo-tag">DEMO WORKSPACE</span><span>Fictional data. Changes stay in this browser. No real payments.</span><Link href="/settings">Connection settings <ArrowUpRight size={13}/></Link></div>}<main className="content">{children}</main><footer className="page-footer"><span>iGO Admin <span className="muted">/</span> Your order. I go.</span><span>Maldives · MVR</span></footer></div></div>;
}
