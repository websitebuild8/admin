import 'server-only';
import { Prisma } from '@/generated/prisma/client';
import { database } from './db';
import { applyCommand, stateSchema, type Command } from './domain';
type Reader = Pick<Prisma.TransactionClient, 'order' | 'restaurant' | 'rider' | 'supportCase' | 'refundReview' | 'auditEvent' | 'serviceSettings'>;
export async function readState(db: Reader = database()) {
  const [orders, restaurants, riders, tickets, refunds, activity, settings] = await Promise.all([
    db.order.findMany({ orderBy: { time: 'desc' } }), db.restaurant.findMany({ orderBy: { name: 'asc' } }), db.rider.findMany({ orderBy: { name: 'asc' } }), db.supportCase.findMany(), db.refundReview.findMany({ orderBy: { time: 'desc' } }), db.auditEvent.findMany({ orderBy: { time: 'desc' }, take: 100 }), db.serviceSettings.findUnique({ where: { id: 'default' } }),
  ]);
  return stateSchema.parse({ orders: orders.map(o => ({ ...o, time: o.time.toISOString() })), restaurants, riders, tickets, refunds: refunds.map(r => ({ ...r, time: r.time.toISOString() })), activity: activity.map(a => ({ ...a, time: a.time.toISOString() })), settings: settings ?? { businessName: 'iGO', supportEmail: '', deliveryFee: 2500, maleEnabled: true, hulhumaleEnabled: true } });
}
export async function mutate(command: Command, actor: string) {
  return database().$transaction(async tx => {
    const before = await readState(tx);
    const after = applyCommand(before, command, actor);
    if (command.type === 'order-status' || command.type === 'assign-rider') {
      const order = after.orders.find(o => o.id === command.id)!;
      await tx.order.update({ where: { id: order.id }, data: { status: order.status, riderId: order.riderId } });
    } else if (command.type === 'partner-status') {
      const data = { status: command.status, documentsVerified: command.verified };
      if (command.kind === 'restaurant') await tx.restaurant.update({ where: { id: command.id }, data });
      else await tx.rider.update({ where: { id: command.id }, data });
    } else if (command.type === 'request-refund') {
      const refund = after.refunds[0];
      await tx.refundReview.create({ data: { ...refund, time: new Date(refund.time) } });
    } else if (command.type === 'resolve-ticket') await tx.supportCase.update({ where: { id: command.id }, data: { status: 'Resolved' } });
    else await tx.serviceSettings.upsert({ where: { id: 'default' }, create: { id: 'default', ...command.values }, update: command.values });
    const event = after.activity[0];
    await tx.auditEvent.create({ data: { ...event, time: new Date(event.time) } });
    return after;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15000 });
}
