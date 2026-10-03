import { WorkflowError, type State, type Command, type Order } from './domain';
import { distanceKm, type Principal } from './fulfilment';

export const RADII_KM = [1, 3, 8];
export const OFFER_SECONDS = 45;
export function availableRiders(state: State, order: Order, now: string) {
  const restaurant = state.restaurants.find(r => r.id === order.restaurantId);
  if (!restaurant?.location) return [];
  return state.riders.filter(r => r.status === 'Active' && r.online && r.documentsVerified && r.location && Date.parse(now) - Date.parse(r.location.receivedAt) <= 120000 && !state.orders.some(o => o.riderId === r.id && o.status !== 'Delivered')).map(r => ({ rider: r, distanceKm: distanceKm(restaurant.location!, r.location!) })).sort((a, b) => a.distanceKm - b.distanceKm);
}
function notify(state: State, order: Order, text: string, now: string, recipients?: string[]) {
  const targets = recipients ?? [`customer:${order.customerId}`, `restaurant:${order.restaurantId}`, ...(order.riderId ? [`rider:${order.riderId}`] : [])];
  for (const recipient of targets) state.notifications.unshift({ id: crypto.randomUUID(), orderId: order.id, recipient, text, time: now });
}
function dispatch(state: State, order: Order, now: string) {
  const w = order.workflow;
  if (order.riderId || w.preparation === 'Awaiting confirmation' || order.status === 'Needs attention') throw new WorkflowError('Confirm an unassigned order before dispatch.');
  if (w.offers.some(o => Date.parse(o.expiresAt) > Date.parse(now))) throw new WorkflowError('The current offer window is still open.');
  if (w.wave >= RADII_KM.length) throw new WorkflowError('Search exhausted. Assign a rider manually.');
  const radius = RADII_KM[w.wave++];
  w.offers = availableRiders(state, order, now).filter(r => r.distanceKm <= radius).map(r => ({ riderId: r.rider.id, distanceKm: r.distanceKm, expiresAt: new Date(Date.parse(now) + OFFER_SECONDS * 1000).toISOString() }));
  notify(state, order, `Delivery request ${order.id}: respond within ${OFFER_SECONDS} seconds.`, now, w.offers.map(o => `rider:${o.riderId}`));
  return `Nearby rider search: ${radius} km · ${w.offers.length} offers`;
}
export function applyFulfilment(state: State, command: Command, actor: string, principal: Principal, now: string): string {
  if (command.type === 'location') {
    if (principal.role !== 'admin' && (principal.role !== 'rider' || principal.id !== command.riderId)) throw new WorkflowError('Not authorized.');
    const rider = state.riders.find(r => r.id === command.riderId);
    if (!rider || rider.status !== 'Active' || !rider.online || !rider.documentsVerified) throw new WorkflowError('Only approved online riders can report location.');
    const age = Date.parse(now) - Date.parse(command.capturedAt);
    if (age < -10000 || age > 120000) throw new WorkflowError('Location is stale or in the future.');
    if (rider.location && (command.sequence <= rider.location.sequence || Date.parse(command.capturedAt) <= Date.parse(rider.location.capturedAt))) throw new WorkflowError('Location updates must be in sequence.');
    if (rider.location) {
      const seconds = (Date.parse(command.capturedAt) - Date.parse(rider.location.capturedAt)) / 1000;
      if (distanceKm(rider.location, command.point) * 1000 > seconds * 45 + rider.location.accuracy + command.accuracy) throw new WorkflowError('Location jump is implausible.');
    }
    rider.location = { ...command.point, accuracy: command.accuracy, capturedAt: command.capturedAt, receivedAt: now, sequence: command.sequence };
    return `Location updated for ${rider.name}`;
  }
  if (!('id' in command)) throw new WorkflowError('Unsupported action.');
  const order = state.orders.find(o => o.id === command.id);
  if (!order || !order.paid) throw new WorkflowError('A verified paid order is required.');
  const w = order.workflow;
  const isAdmin = principal.role === 'admin';
  if (!isAdmin && !(principal.role === 'restaurant' && principal.id === order.restaurantId && command.type === 'preparation') && !(principal.role === 'rider' && ((command.type === 'delivery' && order.riderId === principal.id) || (command.type === 'accept-offer' && command.riderId === principal.id)))) throw new WorkflowError('Not authorized for this order.');
  if (principal.role === 'restaurant' && !state.restaurants.some(r => r.id === principal.id && r.status === 'Active' && r.documentsVerified)) throw new WorkflowError('Restaurant access is no longer active.');
  if (principal.role === 'rider' && !state.riders.some(r => r.id === principal.id && r.status === 'Active' && r.documentsVerified)) throw new WorkflowError('Rider access is no longer active.');
  let text = '';
  if (command.type === 'dispatch') text = dispatch(state, order, now);
  else if (command.type === 'assign-rider' || command.type === 'accept-offer') {
    if (['On the way', 'Delivered', 'Needs attention'].includes(order.status) || w.preparation === 'Awaiting confirmation') throw new WorkflowError('Confirm the order before assigning a rider.');
    const rider = state.riders.find(r => r.id === command.riderId);
    if (!rider || !rider.online || rider.status !== 'Active' || !rider.documentsVerified) throw new WorkflowError('Choose an active, verified online rider.');
    if (state.orders.some(o => o.id !== order.id && o.riderId === rider.id && o.status !== 'Delivered')) throw new WorkflowError('This rider already has an active delivery.');
    if (command.type === 'accept-offer') {
      if (order.riderId || !w.offers.some(o => o.riderId === rider.id && Date.parse(o.expiresAt) > Date.parse(now))) throw new WorkflowError('This offer is expired or already accepted.');
      if (!availableRiders(state, order, now).some(r => r.rider.id === rider.id)) throw new WorkflowError('Rider availability or location is no longer current.');
    }
    if (order.riderId === rider.id) throw new WorkflowError('This rider is already assigned.');
    const previous = order.riderId;
    order.riderId = rider.id; w.delivery = 'Order assigned'; w.offers = [];
    for (const other of state.orders) other.workflow.offers = other.workflow.offers.filter(o => o.riderId !== rider.id);
    if (previous) notify(state, order, 'Your delivery assignment was removed.', now, [`rider:${previous}`]);
    text = `${rider.name}: rider assigned`;
  } else if (command.type === 'preparation' || command.type === 'delivery' || command.type === 'order-status') {
    if (order.status === 'Needs attention') throw new WorkflowError('Resolve this order exception before continuing.');
    // Legacy admin action may confirm/prepare, but cannot bypass delivery milestones.
    const target = command.type === 'order-status' ? ({ Preparing: 'Order confirmed', 'Ready for pickup': 'Ready for pickup' } as Record<string, string>)[command.status] : command.status;
    if (!target) throw new WorkflowError('This order cannot move to that status.');
    if (command.type === 'preparation' || command.type === 'order-status') {
      if (target === w.preparation) return `${order.id}: status already recorded`;
      if (target === 'Order confirmed' && w.preparation === 'Awaiting confirmation') {
        const restaurant = state.restaurants.find(r => r.id === order.restaurantId);
        if (restaurant?.status !== 'Active') throw new WorkflowError('Restaurant must be active.');
        w.preparation = 'Order confirmed'; w.confirmedAt = now; order.status = 'Preparing';
        dispatch(state, order, now);
      } else if (target === 'Ready for pickup' && w.preparation === 'Order confirmed') { w.preparation = 'Ready for pickup'; order.status = 'Ready for pickup'; }
      else if (target !== 'Order picked up') throw new WorkflowError('This order cannot move to that status.');
    }
    if (target === 'Order picked up') {
      if (w.preparation === 'Order picked up') return `${order.id}: pickup already recorded`;
      if (w.preparation !== 'Ready for pickup' || w.delivery !== 'Arrived at restaurant') throw new WorkflowError('Food must be ready and the rider must have arrived before pickup.');
      w.preparation = 'Order picked up'; w.delivery = 'Order picked up'; order.status = 'On the way';
    } else if (command.type === 'delivery') {
      if (!state.riders.some(r => r.id === order.riderId && r.status === 'Active')) throw new WorkflowError('Assign an active rider first.');
      if (target === w.delivery) return `${order.id}: status already recorded`;
      const next: Record<string, string> = { 'Order assigned': 'Arrived at restaurant', 'Order picked up': 'Arrived at customer', 'Arrived at customer': 'Delivery complete' };
      if (next[w.delivery] !== target) throw new WorkflowError('Delivery milestones cannot be skipped.');
      w.delivery = command.status as typeof w.delivery;
      if (target === 'Delivery complete') { order.status = 'Delivered'; state.riders.find(r => r.id === order.riderId)!.deliveries++; }
    }
    text = target;
  } else throw new WorkflowError('Unsupported action.');
  w.events.push({ id: crypto.randomUUID(), text, at: now, actor });
  if (command.type !== 'dispatch') notify(state, order, text, now);
  return `${order.id}: ${text}`;
}
export function eta(state: State, order: Order, now = new Date().toISOString()) {
  if (order.status === 'Delivered') return 'Delivered';
  if (order.workflow.delivery === 'Arrived at customer') return 'Rider has arrived';
  const restaurant = state.restaurants.find(r => r.id === order.restaurantId);
  if (!restaurant?.location || !order.destination || order.status === 'Needs attention') return 'Delivery estimate pending';
  const rider = state.riders.find(r => r.id === order.riderId);
  const fresh = rider?.location && Date.parse(now) - Date.parse(rider.location.receivedAt) <= 120000;
  if (order.riderId && !fresh) return 'Updating delivery estimate';
  // Fallback, not a Google road route: allow for street detours and bridge travel.
  const travel = (a: {lat:number;lng:number}, b: {lat:number;lng:number}) => Math.ceil(distanceKm(a,b) * 1.5 / 18 * 60) + ((a.lat < 4.195) !== (b.lat < 4.195) ? 10 : 0);
  const picked = order.workflow.preparation === 'Order picked up';
  const elapsed = order.workflow.confirmedAt ? Math.max(0,(Date.parse(now)-Date.parse(order.workflow.confirmedAt))/60000) : 0;
  const prep = order.workflow.preparation === 'Ready for pickup' || picked ? 0 : Math.max(0, restaurant.prepTime - elapsed);
  const pickup = picked ? 0 : fresh ? travel(rider!.location!,restaurant.location) : 10;
  const minutes = Math.ceil(Math.max(prep,pickup) + travel(picked && fresh ? rider!.location! : restaurant.location,order.destination) + 3);
  return `About ${minutes}–${minutes+10} min · approximate distance estimate`;
}
export function orderView(state: State, order: Order, principal: Principal) {
  if (principal.role === 'customer' && order.customerId !== principal.id || principal.role === 'restaurant' && order.restaurantId !== principal.id || principal.role === 'rider' && order.riderId !== principal.id) throw new WorkflowError('Not authorized.');
  return { ...(principal.role === 'rider' ? { job: { pickup: state.restaurants.find(r => r.id === order.restaurantId)?.location ?? null, destination: order.destination, address: order.address, items: order.items } } : {}), id: order.id, status: order.status, preparation: order.workflow.preparation, delivery: order.workflow.delivery, rider: state.riders.find(r => r.id === order.riderId)?.name ?? null, estimatedDelivery: eta(state, order), events: order.workflow.events.map(({text,at}) => ({text,at})) };
}
