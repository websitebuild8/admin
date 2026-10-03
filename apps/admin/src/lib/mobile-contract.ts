import { z } from 'zod';

export class MobileError extends Error {
  constructor(message: string, public readonly status = 400) { super(message); }
}
export const mobileRole = z.enum(['customer', 'restaurant', 'rider']);
export const island = z.enum(['Malé', 'Hulhumalé']);
// Preview/pilot coverage rectangles. Approved service polygons are required for launch.
const bounds = {
  'Malé': [4.164, 73.499, 4.183, 73.526],
  'Hulhumalé': [4.199, 73.528, 4.248, 73.559],
} as const;
export const addressInput = z.object({
  area: island,
  building: z.string().trim().min(1).max(100),
  unit: z.string().trim().max(100).default(''),
  instructions: z.string().trim().max(300).default(''),
  latitude: z.number().finite(), longitude: z.number().finite(),
}).strict().refine(v => {
  const [south, west, north, east] = bounds[v.area];
  return v.latitude >= south && v.latitude <= north && v.longitude >= west && v.longitude <= east;
}, {message:'Choose an entrance on the selected island.'});
export const registrationInput = z.object({
  role: mobileRole,
  name: z.string().trim().min(2).max(100),
  phone: z.string().trim().regex(/^\+960[379]\d{6}$/, 'Use a Maldives phone number beginning +960.'),
  area: island,
  businessName: z.string().trim().max(100).optional(),
  cuisine: z.string().trim().max(100).optional(),
  pickup: addressInput.optional(),
  vehicle: z.enum(['Motorbike', 'Bicycle', 'Car']).optional(),
  policyVersion: z.string().max(80),
  acceptedPolicies: z.literal(true),
}).strict().superRefine((v, ctx) => {
  if (v.role === 'restaurant' && (!v.businessName || v.businessName.length < 2 || !v.pickup || v.pickup.area !== v.area)) {
    ctx.addIssue({code:'custom',message:'A restaurant name and matching pickup entrance are required.'});
  }
  if (v.role === 'rider' && !v.vehicle) ctx.addIssue({code:'custom',message:'Choose your delivery vehicle.'});
});
export const menuInput = z.object({
  id: z.uuid().optional(), name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(300), price: z.number().int().min(100).max(1000000),
  available: z.boolean(),
}).strict();
export const quoteInput = z.object({
  restaurantId: z.uuid(), addressId: z.uuid(),
  items: z.array(z.object({id:z.uuid(),quantity:z.number().int().min(1).max(20)}).strict()).min(1).max(30),
  note: z.string().trim().max(300).default(''),
}).strict().refine(v => new Set(v.items.map(i=>i.id)).size === v.items.length, 'Duplicate menu items.');

type Binding = { id:string; status:string; documentsVerified:boolean } | null;
export function approvedPrincipal(profile: {id:string; primaryRole:string|null; roles:{role:string;status:string}[]}, restaurant:Binding, rider:Binding) {
  const role = profile.primaryRole;
  if (!role || !profile.roles.some(r=>r.role===role && r.status==='Active')) return null;
  if (role === 'customer') return {role:'customer' as const,id:profile.id};
  const entity = role === 'restaurant' ? restaurant : role === 'rider' ? rider : null;
  if (!entity || entity.status !== 'Active' || !entity.documentsVerified) return null;
  return {role:role as 'restaurant'|'rider',id:entity.id};
}
export function policyVersion() { return process.env.IGO_POLICY_VERSION ?? 'draft-2026-10-04'; }
export function policiesReady() { return process.env.IGO_POLICIES_APPROVED === 'true' && !policyVersion().startsWith('draft'); }
export function requireCurrentPolicies(version:string) {
  if (version !== policyVersion()) throw new MobileError('Policies changed. Refresh and review them again.',409);
  if (process.env.NODE_ENV === 'production' && !policiesReady()) throw new MobileError('Registration opens after iGO publishes its policies.',503);
}
export function addressLabel(v:z.infer<typeof addressInput>) { return [v.building,v.unit,v.area,v.instructions].filter(Boolean).join(' · '); }
export function publicOrderId() { return `IGO-${crypto.randomUUID().replaceAll('-','').slice(0,16).toUpperCase()}`; }
