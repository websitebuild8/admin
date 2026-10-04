import {notFound} from 'next/navigation';
import {legalDraft} from '@/lib/legal-text';
const names:Record<string,string>={terms:'Customer terms',privacy:'Privacy notice',refunds:'Cancellation and order problems',partners:'Restaurant and rider terms'};
export default async function Policy({params}:{params:Promise<{document:string}>}) {
 const {document}=await params;if(!names[document])notFound();
 return <main style={{maxWidth:840,margin:'40px auto',padding:24}}><h1>{names[document]}</h1><p><strong>Draft for pilot review. Business details are placeholders. Payment collection is disabled.</strong></p><p>Version: draft-2026-10-05</p><div style={{whiteSpace:'pre-wrap',lineHeight:1.8}}>{legalDraft}</div><p>Location services: <a className="underline" href="https://maps.google.com/help/terms_maps/">Google Maps Terms of Service</a> and <a className="underline" href="https://policies.google.com/privacy">Google Privacy Policy</a>.</p></main>;
}
