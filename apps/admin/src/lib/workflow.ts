import { WorkflowError, type State, type Command, type Order } from './domain';
import { distanceKm, type Principal } from './fulfilment';

export const MAX_OFFER_WINDOWS = 3;
export const OFFER_SECONDS = 45;
export function availableRiders(state: State, order: Order) {
  const restaurant = state.restaurants.find(r => r.id === order.restaurantId);
  if (!restaurant) return [];
  return state.riders.filter(r => r.status === 'Active' && r.online && r.documentsVerified && r.area === restaurant.area && !state.orders.some(o => o.riderId === r.id && o.status !== 'Delivered')).map(r => ({rider:r, distanceKm:null}));
}
function notify(state: State, order: Order, text: string, now: string, recipients?: string[]) {
  const targets = recipients ?? [`customer:${order.customerId}`, `restaurant:${order.restaurantId}`, ...(order.riderId ? [`rider:${order.riderId}`] : [])];
  for (const recipient of targets) state.notifications.unshift({ id: crypto.randomUUID(), orderId: order.id, recipient, text, time: now });
}
function dispatch(state: State, order: Order, now: string) {
  const w = order.workflow;
  if (order.riderId || w.preparation === 'Awaiting confirmation' || order.status === 'Needs attention') throw new WorkflowError('Confirm an unassigned order before dispatch.');
  if (w.offers.some(o => Date.parse(o.expiresAt) > Date.parse(now))) throw new WorkflowError('The current offer window is still open.');
  if (w.wave >= MAX_OFFER_WINDOWS) throw new WorkflowError('Search exhausted. Assign a rider manually.');
  w.wave++;
  w.offers = availableRiders(state, order).map(r => ({ riderId: r.rider.id, distanceKm: r.distanceKm, expiresAt: new Date(Date.parse(now) + OFFER_SECONDS * 1000).toISOString() }));
  notify(state, order, `Delivery request ${order.id}: respond within ${OFFER_SECONDS} seconds.`, now, w.offers.map(o => `rider:${o.riderId}`));
  return `Service-area requests: window ${w.wave} · ${w.offers.length} offers`;
}
export function applyFulfilment(state: State, command: Command, actor: string, principal: Principal, now: string): string {
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
      if (!availableRiders(state, order).some(r => r.rider.id === rider.id)) throw new WorkflowError('Rider availability or service area changed.');
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
  // A heuristic between saved entrance pins, never the rider's device location.
  const pickup = order.pickupAddress ? {lat:order.pickupAddress.latitude,lng:order.pickupAddress.longitude} : restaurant.location;
  const travel = Math.ceil(distanceKm(pickup!,order.destination) * 1.5 / 18 * 60) + ((pickup!.lat < 4.195) !== (order.destination.lat < 4.195) ? 10 : 0);
  const picked = order.workflow.preparation === 'Order picked up';
  const elapsed = order.workflow.confirmedAt ? Math.max(0,(Date.parse(now)-Date.parse(order.workflow.confirmedAt))/60000) : 0;
  const prep = order.workflow.preparation === 'Ready for pickup' || picked ? 0 : Math.max(0, restaurant.prepTime - elapsed);
  const minutes = Math.ceil(prep + travel + (picked ? 3 : 10));
  return `About ${minutes}–${minutes+10} min · approximate distance estimate`;
}
export function orderView(state: State, order: Order, principal: Principal) {
  if (principal.role === 'customer' && order.customerId !== principal.id || principal.role === 'restaurant' && order.restaurantId !== principal.id || principal.role === 'rider' && order.riderId !== principal.id) throw new WorkflowError('Not authorized.');
  const entrances = {pickup:order.pickupAddress ? {lat:order.pickupAddress.latitude,lng:order.pickupAddress.longitude} : state.restaurants.find(r=>r.id===order.restaurantId)?.location ?? null,destination:order.destination};
  return { ...(principal.role === 'customer' ? {entrances} : {}), ...(principal.role === 'rider' ? { job: { pickup: order.pickupAddress ? {lat:order.pickupAddress.latitude,lng:order.pickupAddress.longitude} : state.restaurants.find(r => r.id === order.restaurantId)?.location ?? null, pickupLabel: order.pickupAddress ? [order.pickupAddress.building,order.pickupAddress.unit,order.pickupAddress.instructions].filter(Boolean).join(' · ') : '', destination: order.destination, address: order.address, items: order.items } } : {}), id: order.id, publicId:order.publicId ?? order.id, restaurant:state.restaurants.find(r=>r.id===order.restaurantId)?.name, amount:order.amount, items:order.items, status: order.status, preparation: order.workflow.preparation, delivery: order.workflow.delivery, rider: state.riders.find(r => r.id === order.riderId)?.name ?? null, estimatedDelivery: eta(state, order), events: order.workflow.events.map(({text,at}) => ({text,at})) };
}
