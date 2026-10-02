'use client';
import { ArrowUpRight, Inbox, LoaderCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useData } from './data-provider';
export function Status({ value }: { value: string }) {
  const kind = ['Active', 'Delivered', 'Resolved', 'Verified'].includes(value) ? 'green' : ['Needs attention', 'Suspended', 'Rejected', 'High'].includes(value) ? 'red' : ['On the way', 'Preparing'].includes(value) ? 'blue' : ['Pending', 'Awaiting restaurant', 'Ready for pickup', 'Requested', 'Open'].includes(value) ? 'amber' : 'gray';
  return <span className={`status ${kind}`}><i/>{value}</span>;
}
export function PageHeading({ eyebrow, title, description, children }: { eyebrow?: string; title: string; description: string; children?: React.ReactNode }) { return <div className="page-heading"><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h1>{title}</h1><p>{description}</p></div><div className="heading-actions">{children}</div></div>; }
export function Empty({ title = 'Nothing here yet', text = 'Try another search or filter.' }: { title?: string; text?: string }) { return <div className="empty-state"><Inbox size={30}/><strong>{title}</strong><p>{text}</p></div>; }
export function DataBoundary({ children }: { children: React.ReactNode }) { const { state, error, refresh } = useData(); if (error) return <div className="empty-state"><strong>Workspace unavailable</strong><p>{error}</p><Button onClick={refresh}><RefreshCw size={16}/>Try again</Button></div>; if (!state) return <div className="empty-state"><LoaderCircle className="animate-spin" size={28}/><p>Loading your workspace…</p></div>; return children; }
export function SmallLink({ children }: { children: React.ReactNode }) { return <span className="small-link">{children}<ArrowUpRight size={15}/></span>; }
export function timeLabel(value: string) { return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Indian/Maldives' }).format(new Date(value)); }
export function downloadCSV(name: string, rows: (string | number)[][]) { const escape = (v: string | number) => { const s = String(v); return `"${(/^[=+@\-\t\r]/.test(s) ? "'" : '') + s.replaceAll('"', '""')}"`; }; const blob = new Blob(['\uFEFF' + rows.map(row => row.map(escape).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8;' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url); }
