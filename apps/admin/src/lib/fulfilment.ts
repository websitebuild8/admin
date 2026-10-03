import { z } from 'zod';

export const pointSchema = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) });
export const fixSchema = pointSchema.extend({ accuracy: z.number().min(0).max(100), capturedAt: z.iso.datetime(), receivedAt: z.iso.datetime(), sequence: z.number().int().nonnegative() });
export const preparationSchema = z.enum(['Awaiting confirmation', 'Order confirmed', 'Ready for pickup', 'Order picked up']);
export const deliverySchema = z.enum(['Unassigned', 'Order assigned', 'Arrived at restaurant', 'Order picked up', 'Arrived at customer', 'Delivery complete']);
export const workflowSchema = z.object({
  preparation: preparationSchema, delivery: deliverySchema,
  confirmedAt: z.iso.datetime().nullable().default(null),
  wave: z.number().int().min(0).max(3).default(0),
  offers: z.array(z.object({ riderId: z.string(), distanceKm: z.number().nullable().default(null), expiresAt: z.iso.datetime() })).default([]),
  events: z.array(z.object({ id: z.string(), text: z.string(), at: z.iso.datetime(), actor: z.string() })).default([]),
});
export const notificationSchema = z.object({ id: z.string(), orderId: z.string(), recipient: z.string(), text: z.string(), time: z.iso.datetime() });
export type Point = z.infer<typeof pointSchema>;
export type Workflow = z.infer<typeof workflowSchema>;
export type Principal = { role: 'admin' | 'rider' | 'restaurant' | 'customer'; id: string };
export const fulfilmentCommands = [
  z.object({ type: z.literal('preparation'), id: z.string(), status: preparationSchema }),
  z.object({ type: z.literal('delivery'), id: z.string(), status: deliverySchema }),
  z.object({ type: z.literal('dispatch'), id: z.string() }),
  z.object({ type: z.literal('accept-offer'), id: z.string(), riderId: z.string() }),
] as const;
export function distanceKm(a: Point, b: Point) {
  const rad = Math.PI / 180;
  const h = Math.sin((b.lat - a.lat) * rad / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin((b.lng - a.lng) * rad / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}
export function initialWorkflow(status: string, riderId: string | null): Workflow {
  return workflowSchema.parse({ preparation: status === 'Awaiting restaurant' || status === 'Needs attention' ? 'Awaiting confirmation' : status === 'Preparing' ? 'Order confirmed' : status === 'Ready for pickup' ? 'Ready for pickup' : 'Order picked up', delivery: status === 'Delivered' ? 'Delivery complete' : status === 'On the way' ? 'Order picked up' : riderId ? 'Order assigned' : 'Unassigned' });
}
