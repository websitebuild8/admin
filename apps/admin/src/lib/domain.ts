import { z } from 'zod';

export class WorkflowError extends Error {}

export const orderStatus = z.enum(['Awaiting restaurant', 'Preparing', 'Ready for pickup', 'On the way', 'Delivered', 'Needs attention']);
export const partnerStatus = z.enum(['Pending', 'Active', 'Suspended', 'Rejected']);
export const orderSchema = z.object({ id: z.string(), customerId: z.string(), customer: z.string(), restaurantId: z.string(), items: z.string(), amount: z.number().int().nonnegative(), area: z.enum(['Malé', 'Hulhumalé']), address: z.string(), status: orderStatus, riderId: z.string().nullable(), time: z.string(), paid: z.boolean(), paymentRef: z.string() });
export const restaurantSchema = z.object({ id: z.string(), name: z.string(), initials: z.string(), cuisine: z.string(), area: z.string(), contact: z.string(), status: partnerStatus, prepTime: z.number(), color: z.string(), documentsVerified: z.boolean() });
export const riderSchema = z.object({ id: z.string(), name: z.string(), initials: z.string(), area: z.string(), phone: z.string(), status: partnerStatus, online: z.boolean(), deliveries: z.number(), documentsVerified: z.boolean() });
export const ticketSchema = z.object({ id: z.string(), orderId: z.string(), subject: z.string(), customer: z.string(), priority: z.enum(['High', 'Normal']), status: z.enum(['Open', 'Resolved']) });
export const refundSchema = z.object({ id: z.string(), orderId: z.string(), amount: z.number().int().positive(), reason: z.string(), status: z.literal('Requested'), time: z.string() });
export const settingsSchema = z.object({ businessName: z.string().trim().min(2).max(100), supportEmail: z.union([z.literal(''), z.email()]), deliveryFee: z.number().int().min(0).max(100000), maleEnabled: z.boolean(), hulhumaleEnabled: z.boolean() });
export const stateSchema = z.object({ orders: z.array(orderSchema), restaurants: z.array(restaurantSchema), riders: z.array(riderSchema), tickets: z.array(ticketSchema), refunds: z.array(refundSchema), activity: z.array(z.object({ id: z.string(), text: z.string(), time: z.string(), actor: z.string() })), settings: settingsSchema });
export type State = z.infer<typeof stateSchema>;
export type Order = z.infer<typeof orderSchema>;
export type Restaurant = z.infer<typeof restaurantSchema>;
export type Rider = z.infer<typeof riderSchema>;
export const commandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('order-status'), id: z.string(), status: orderStatus }),
  z.object({ type: z.literal('assign-rider'), id: z.string(), riderId: z.string() }),
  z.object({ type: z.literal('partner-status'), kind: z.enum(['restaurant', 'rider']), id: z.string(), status: partnerStatus, verified: z.boolean(), reason: z.string().max(500) }),
  z.object({ type: z.literal('request-refund'), id: z.string(), amount: z.number().int().positive(), reason: z.string().trim().min(10).max(500) }),
  z.object({ type: z.literal('resolve-ticket'), id: z.string() }),
  z.object({ type: z.literal('settings'), values: settingsSchema }),
]);
export type Command = z.infer<typeof commandSchema>;
export const nextStatus: Partial<Record<Order['status'], Order['status']>> = { 'Awaiting restaurant': 'Preparing', 'Preparing': 'Ready for pickup', 'Ready for pickup': 'On the way', 'On the way': 'Delivered' };
export function applyCommand(input: State, raw: Command, actor: string, now = new Date().toISOString()): State {
  const command = commandSchema.parse(raw);
  const state = structuredClone(input);
  let text = '';
  if (command.type === 'order-status') {
    const order = state.orders.find(o => o.id === command.id);
    if (!order || !order.paid) throw new WorkflowError('A verified paid order is required.');
    if (nextStatus[order.status] !== command.status) throw new WorkflowError('This order cannot move to that status.');
    if (command.status === 'On the way' && !state.riders.some(r => r.id === order.riderId && r.status === 'Active')) throw new WorkflowError('Assign an active rider before dispatch.');
    order.status = command.status;
    text = `${order.id} moved to ${command.status.toLowerCase()}`;
  } else if (command.type === 'assign-rider') {
    const order = state.orders.find(o => o.id === command.id);
    const rider = state.riders.find(r => r.id === command.riderId);
    if (!order || !order.paid || ['Delivered', 'Needs attention', 'On the way'].includes(order.status)) throw new WorkflowError('This order cannot be assigned.');
    if (!rider || rider.status !== 'Active' || !rider.online) throw new WorkflowError('Choose an active, online rider.');
    if (state.orders.some(o => o.id !== order.id && o.riderId === rider.id && o.status !== 'Delivered')) throw new WorkflowError('This rider already has an active delivery.');
    order.riderId = rider.id;
    text = `${rider.name} assigned to ${order.id}`;
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
  } else {
    state.settings = command.values; text = 'Service settings updated';
  }
  state.activity.unshift({ id: crypto.randomUUID(), text, actor, time: now });
  return state;
}
export const money = (amount: number) => `MVR ${(amount / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
