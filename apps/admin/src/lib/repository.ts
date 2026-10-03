import 'server-only';
import { Prisma } from '@/generated/prisma/client';
import { database } from './db';
import type { Principal } from './fulfilment';
import { applyCommand, stateSchema, type Command } from './domain';
type Reader = Pick<Prisma.TransactionClient, 'order' | 'restaurant' | 'rider' | 'supportCase' | 'refundReview' | 'auditEvent' | 'serviceSettings' | 'notification'>;
export async function readState(db: Reader = database()) {
  const [orders, restaurants, riders, tickets, refunds, activity, settings, notifications] = await Promise.all([
    db.order.findMany({ orderBy: { time: 'desc' } }), db.restaurant.findMany({ orderBy: { name: 'asc' } }), db.rider.findMany({ orderBy: { name: 'asc' } }), db.supportCase.findMany(), db.refundReview.findMany({ orderBy: { time: 'desc' } }), db.auditEvent.findMany({ orderBy: { time: 'desc' }, take: 100 }), db.serviceSettings.findUnique({ where: { id: 'default' } }), db.notification.findMany({orderBy:{time:'desc'},take:200}),
  ]);
  return stateSchema.parse({ orders: orders.map(o => ({ ...o, workflow: o.workflow ?? undefined, time: o.time.toISOString() })), restaurants, riders, tickets, refunds: refunds.map(r => ({ ...r, time: r.time.toISOString() })), activity: activity.map(a => ({ ...a, time: a.time.toISOString() })), notifications: notifications.map(n => ({...n, time:n.time.toISOString()})), settings: settings ?? { businessName: 'iGO', supportEmail: '', deliveryFee: 2500, maleEnabled: true, hulhumaleEnabled: true } });
}
export async function mutate(command: Command, actor: string, principal: Principal = {role:'admin',id:actor}) {
  return database().$transaction(async tx => {
    const before = await readState(tx);
    const after = applyCommand(before, command, actor, new Date().toISOString(), principal);
    if (['preparation','delivery','dispatch','accept-offer','order-status','assign-rider'].includes(command.type)) {
      for (const order of after.orders) {
        const old = before.orders.find(o => o.id === order.id)!;
        if (JSON.stringify(order) !== JSON.stringify(old)) await tx.order.update({where:{id:order.id},data:{status:order.status,riderId:order.riderId,workflow:order.workflow}});
      }
      for (const rider of after.riders) {
        if (JSON.stringify(rider) !== JSON.stringify(before.riders.find(r => r.id === rider.id))) await tx.rider.update({where:{id:rider.id},data:{deliveries:rider.deliveries}});
      }
    } else if (command.type === 'partner-status') {
      const partner=command.kind==='restaurant' ? await tx.restaurant.findUniqueOrThrow({where:{id:command.id}}) : await tx.rider.findUniqueOrThrow({where:{id:command.id}});
      if(partner.clerkUserId) {
        const profile=await tx.profile.findUnique({where:{clerkUserId:partner.clerkUserId}});
        if(!profile || profile.primaryRole!==command.kind) throw new Error('Registration binding missing.');
        await tx.roleApplication.update({where:{profileId_role:{profileId:profile.id,role:command.kind}},data:{status:command.status,reviewedBy:actor,reviewedAt:new Date()}});
      }
      const data = { status: command.status, documentsVerified: command.verified };
      if (command.kind === 'restaurant') {
        const restaurant=await tx.restaurant.findUniqueOrThrow({where:{id:command.id}});
        const approved=command.status==='Active' ? restaurant.pendingPickupAddress : null;
        const address=approved ? (await import('./mobile-contract')).addressInput.parse(approved) : null;
        await tx.restaurant.update({where:{id:command.id},data:{...data,...(address ? {pickupAddress:address,pendingPickupAddress:Prisma.DbNull,area:address.area,location:{lat:address.latitude,lng:address.longitude}} : {}),...(command.status!=='Active' ? {acceptingOrders:false} : {})}});
      }
      else await tx.rider.update({ where: { id: command.id }, data });
    } else if (command.type === 'approve-pickup') {
      const partner=after.restaurants.find(r=>r.id===command.id)!;
      await tx.restaurant.update({where:{id:command.id},data:{pickupAddress:partner.pickupAddress!,pendingPickupAddress:Prisma.DbNull,location:partner.location!,area:partner.area}});
    } else if (command.type === 'request-refund') {
      const refund = after.refunds[0];
      await tx.refundReview.create({ data: { ...refund, time: new Date(refund.time) } });
    } else if (command.type === 'resolve-ticket') await tx.supportCase.update({ where: { id: command.id }, data: { status: 'Resolved' } });
    else if (command.type === 'settings') await tx.serviceSettings.upsert({ where: { id: 'default' }, create: { id: 'default', ...command.values }, update: command.values });
    const existing = new Set(before.notifications.map(n => n.id));
    const notices = after.notifications.filter(n => !existing.has(n.id));
    if (notices.length) await tx.notification.createMany({data:notices.map(n => ({...n,time:new Date(n.time)}))});
    const event = after.activity[0];
    await tx.auditEvent.create({ data: { ...event, time: new Date(event.time) } });
    return after;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15000 });
}
