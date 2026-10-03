import { z } from 'zod';
import { pointSchema, fixSchema, workflowSchema, notificationSchema, fulfilmentCommands, initialWorkflow, type Principal } from './fulfilment';
import { applyFulfilment } from './workflow';

export class WorkflowError extends Error {}

export const orderStatus = z.enum(['Awaiting restaurant', 'Preparing', 'Ready for pickup', 'On the way', 'Delivered', 'Needs attention']);
export const partnerStatus = z.enum(['Pending', 'Active', 'Suspended', 'Rejected']);
export const orderSchema = z.object({ id: z.string(), customerId: z.string(), customer: z.string(), restaurantId: z.string(), items: z.string(), amount: z.number().int().nonnegative(), area: z.enum(['Malé', 'Hulhumalé']), address: z.string(), status: orderStatus, riderId: z.string().nullable(), time: z.string(), paid: z.boolean(), paymentRef: z.string(), destination: pointSchema.nullable().default(null), workflow: workflowSchema.optional() }).transform(o => ({ ...o, workflow: o.workflow ?? initialWorkflow(o.status, o.riderId) }));
export const restaurantSchema = z.object({ id: z.string(), name: z.string(), initials: z.string(), cuisine: z.string(), area: z.string(), contact: z.string(), status: partnerStatus, prepTime: z.number(), location: pointSchema.nullable().default(null), color: z.string(), documentsVerified: z.boolean() });
export const riderSchema = z.object({ id: z.string(), name: z.string(), initials: z.string(), area: z.string(), phone: z.string(), status: partnerStatus, online: z.boolean(), deliveries: z.number(), location: fixSchema.nullable().default(null), documentsVerified: z.boolean() });
export const ticketSchema = z.object({ id: z.string(), orderId: z.string(), subject: z.string(), customer: z.string(), priority: z.enum(['High', 'Normal']), status: z.enum(['Open', 'Resolved']) });
export const refundSchema = z.object({ id: z.string(), orderId: z.string(), amount: z.number().int().positive(), reason: z.string(), status: z.literal('Requested'), time: z.string() });
export const settingsSchema = z.object({ businessName: z.string().trim().min(2).max(100), supportEmail: z.union([z.literal(''), z.email()]), deliveryFee: z.number().int().min(0).max(100000), maleEnabled: z.boolean(), hulhumaleEnabled: z.boolean() });
export const stateSchema = z.object({ orders: z.array(orderSchema), restaurants: z.array(restaurantSchema), riders: z.array(riderSchema), tickets: z.array(ticketSchema), refunds: z.array(refundSchema), activity: z.array(z.object({ id: z.string(), text: z.string(), time: z.string(), actor: z.string() })), settings: settingsSchema, notifications: z.array(notificationSchema).default([]) });
export type State = z.infer<typeof stateSchema>;
export type Order = z.infer<typeof orderSchema>;
export type Restaurant = z.infer<typeof restaurantSchema>;
export type Rider = z.infer<typeof riderSchema>;
export const commandSchema = z.discriminatedUnion('type', [
  ...fulfilmentCommands,
  z.object({ type: z.literal('order-status'), id: z.string(), status: orderStatus }),
  z.object({ type: z.literal('assign-rider'), id: z.string(), riderId: z.string() }),
  z.object({ type: z.literal('partner-status'), kind: z.enum(['restaurant', 'rider']), id: z.string(), status: partnerStatus, verified: z.boolean(), reason: z.string().max(500) }),
  z.object({ type: z.literal('request-refund'), id: z.string(), amount: z.number().int().positive(), reason: z.string().trim().min(10).max(500) }),
  z.object({ type: z.literal('resolve-ticket'), id: z.string() }),
  z.object({ type: z.literal('settings'), values: settingsSchema }),
]);
export type Command = z.infer<typeof commandSchema>;
export const nextStatus: Partial<Record<Order['status'], Order['status']>> = { 'Awaiting restaurant': 'Preparing', 'Preparing': 'Ready for pickup', 'Ready for pickup': 'On the way', 'On the way': 'Delivered' };
export function applyCommand(input: State, raw: Command, actor: string, now = new Date().toISOString(), principal: Principal = { role: 'admin', id: actor }): State {
  const command = commandSchema.parse(raw);
  const state = stateSchema.parse(structuredClone(input));
  if (principal.role !== 'admin' && !['preparation', 'delivery', 'accept-offer', 'location'].includes(command.type)) throw new WorkflowError('Not authorized.');
  let text = '';
  if (['preparation', 'delivery', 'dispatch', 'accept-offer', 'location', 'assign-rider', 'order-status'].includes(command.type)) {
    text = applyFulfilment(state, command, actor, principal, now);
  } else if (command.type === 'partner-status') {
    const partner = (command.kind === 'restaurant' ? state.restaurants : state.riders).find(p => p.id === command.id);
    if (!partner) throw new WorkflowError('Application not found.');
    if (command.status === partner.status) throw new WorkflowError('This status is already set.');
    if (command.status === 'Active' && !command.verified) throw new WorkflowError('Verify the application documents before approval.');
    if (['Rejected', 'Suspended'].includes(command.status) && command.reason.trim().length < 10) throw new WorkflowError('Provide a reason of at least 10 characters.');
    if (command.kind === 'rider' && command.status === 'Suspended' && state.orders.some(o => o.riderId === partner.id && o.status !== 'Delivered')) throw new WorkflowError('Resolve or reassign active deliveries before suspending this rider.');
    partner.status = command.status;
    partner.documentsVerified = command.verified;
    text = `${partner.name}: ${command.status.toLowerCase()}${command.reason ? ` — ${command.reason}` : ''}`;
  } else if (command.type === 'request-refund') {
    const order = state.orders.find(o => o.id === command.id);
    if (!order?.paid) throw new WorkflowError('Only verified payments can enter refund review.');
    const reserved = state.refunds.filter(r => r.orderId === order.id).reduce((sum, r) => sum + r.amount, 0);
    if (reserved + command.amount > order.amount) throw new WorkflowError('Amount exceeds the remaining refundable payment.');
    state.refunds.unshift({ id: crypto.randomUUID(), orderId: order.id, amount: command.amount, reason: command.reason, status: 'Requested', time: now });
    text = `Refund review requested for ${order.id} — ${command.reason}`;
  } else if (command.type === 'resolve-ticket') {
    const ticket = state.tickets.find(t => t.id === command.id);
    if (!ticket || ticket.status === 'Resolved') throw new WorkflowError('This case is already resolved or unavailable.');
    ticket.status = 'Resolved'; text = `${ticket.id} marked resolved`;
  } else if (command.type === 'settings') {
    state.settings = command.values; text = 'Service settings updated';
  }
  state.activity.unshift({ id: crypto.randomUUID(), text, actor, time: now });
  return state;
}
export const money = (amount: number) => `MVR ${(amount / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
