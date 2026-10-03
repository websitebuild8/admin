import { stateSchema, type State } from './domain';
export function createDemoState(): State {
  const time = (minutes: number) => new Date(Date.now() - minutes * 60000).toISOString();
  const state = stateSchema.parse({
    restaurants: [
      { id: 'the-cafe', name: 'The Café', initials: 'TC', cuisine: 'Coffee · Breakfast', area: 'Malé', contact: 'cafe@example.com', status: 'Active', prepTime: 15, color: 'coffee', documentsVerified: true },
      { id: 'island-bites', name: 'Island Bites', initials: 'IB', cuisine: 'Maldivian · Local favorites', area: 'Hulhumalé', contact: 'island@example.com', status: 'Active', prepTime: 25, color: 'leaf', documentsVerified: true },
      { id: 'pizza-wave', name: 'Pizza Wave', initials: 'PW', cuisine: 'Pizza · Italian', area: 'Malé', contact: 'pizza@example.com', status: 'Active', prepTime: 20, color: 'peach', documentsVerified: true },
      { id: 'burger-hub', name: 'Burger Hub', initials: 'BH', cuisine: 'Burgers · Comfort food', area: 'Hulhumalé', contact: 'burger@example.com', status: 'Active', prepTime: 20, color: 'lavender', documentsVerified: true },
      { id: 'green-bowl', name: 'Green Bowl', initials: 'GB', cuisine: 'Salads · Healthy', area: 'Malé', contact: 'green@example.com', status: 'Pending', prepTime: 15, color: 'leaf', documentsVerified: false },
      { id: 'sweet-spot', name: 'Sweet Spot', initials: 'SS', cuisine: 'Desserts · Bakery', area: 'Hulhumalé', contact: 'sweet@example.com', status: 'Pending', prepTime: 15, color: 'peach', documentsVerified: false },
    ],
    riders: [
      { id: 'r1', name: 'Ahmed Ali', initials: 'AA', area: 'Malé', phone: 'Demo contact', status: 'Active', online: true, deliveries: 146, documentsVerified: true },
      { id: 'r2', name: 'Hassan Mohamed', initials: 'HM', area: 'Hulhumalé', phone: 'Demo contact', status: 'Active', online: true, deliveries: 92, documentsVerified: true },
      { id: 'r3', name: 'Ibrahim Shifau', initials: 'IS', area: 'Malé', phone: 'Demo contact', status: 'Active', online: true, deliveries: 208, documentsVerified: true },
      { id: 'r4', name: 'Aishath Hana', initials: 'AH', area: 'Hulhumalé', phone: 'Demo contact', status: 'Active', online: false, deliveries: 67, documentsVerified: true },
      { id: 'r5', name: 'Mohamed Rilwan', initials: 'MR', area: 'Malé', phone: 'Demo contact', status: 'Pending', online: false, deliveries: 0, documentsVerified: false },
    ],
    orders: [
      { id: 'IGO-8K2M4', customerId: 'c1', customer: 'Aishath Naila', restaurantId: 'the-cafe', items: 'Iced latte × 2, chocolate cake × 1', amount: 17500, area: 'Malé', address: 'Demo address · Henveiru, Malé', status: 'Awaiting restaurant', riderId: null, time: time(3), paid: true, paymentRef: 'DEMO-BML-1001' },
      { id: 'IGO-7P9A2', customerId: 'c2', customer: 'Mohamed Ayan', restaurantId: 'island-bites', items: 'Chicken rice × 2, fresh juice × 1', amount: 24500, area: 'Hulhumalé', address: 'Demo address · Phase 1, Hulhumalé', status: 'Preparing', riderId: null, time: time(8), paid: true, paymentRef: 'DEMO-BML-1002' },
      { id: 'IGO-6H3N8', customerId: 'c3', customer: 'Fathimath Sara', restaurantId: 'pizza-wave', items: 'Margherita pizza × 1, garlic bread × 1', amount: 21000, area: 'Malé', address: 'Demo address · Maafannu, Malé', status: 'Ready for pickup', riderId: 'r1', time: time(14), paid: true, paymentRef: 'DEMO-BML-1003' },
      { id: 'IGO-5R8J1', customerId: 'c4', customer: 'Ibrahim Zayan', restaurantId: 'burger-hub', items: 'Classic burger × 2, fries × 1', amount: 23000, area: 'Hulhumalé', address: 'Demo address · Phase 2, Hulhumalé', status: 'On the way', riderId: 'r2', time: time(21), paid: true, paymentRef: 'DEMO-BML-1004' },
      { id: 'IGO-4T6B9', customerId: 'c5', customer: 'Mariyam Noor', restaurantId: 'the-cafe', items: 'Breakfast sandwich × 1, cappuccino × 1', amount: 13500, area: 'Malé', address: 'Demo address · Galolhu, Malé', status: 'Needs attention', riderId: null, time: time(32), paid: true, paymentRef: 'DEMO-BML-1005' },
      ...Array.from({ length: 8 }, (_, i) => ({ id: `IGO-3D${i}F7`, customerId: ['c1', 'c6', 'c5', 'c2'][i % 4], customer: ['Aishath Naila', 'Hassan Adam', 'Mariyam Noor', 'Mohamed Ayan'][i % 4], restaurantId: ['the-cafe', 'island-bites', 'pizza-wave', 'burger-hub'][i % 4], items: 'Lunch combo × 1', amount: [18500, 14000, 22500, 16000][i % 4], area: (i % 2 ? 'Hulhumalé' : 'Malé') as 'Malé' | 'Hulhumalé', address: 'Demo delivery address', status: 'Delivered' as const, riderId: i % 2 ? 'r1' : 'r2', time: time(60 + i * 38), paid: true, paymentRef: `DEMO-BML-200${i}` })),
    ],
    tickets: [
      { id: 'CASE-102', orderId: 'IGO-4T6B9', subject: 'Restaurant has not accepted the order', customer: 'Mariyam Noor', priority: 'High', status: 'Open' },
      { id: 'CASE-101', orderId: 'IGO-3D1F7', subject: 'One item missing from delivery', customer: 'Hassan Adam', priority: 'Normal', status: 'Open' },
    ],
    refunds: [],
    activity: [
      { id: 'a1', text: 'Green Bowl submitted a restaurant application', actor: 'System', time: time(12) },
      { id: 'a2', text: 'IGO-5R8J1 picked up by Hassan Mohamed', actor: 'System', time: time(16) },
      { id: 'a3', text: 'Mohamed Rilwan applied to become a rider', actor: 'System', time: time(28) },
      { id: 'a4', text: 'A delivery issue was reported for IGO-4T6B9', actor: 'System', time: time(31) },
    ],
    settings: { businessName: 'iGO', supportEmail: '', deliveryFee: 2500, maleEnabled: true, hulhumaleEnabled: true },
  });
  state.restaurants.forEach(r => { r.location = r.area === 'Malé' ? { lat: 4.175, lng: 73.509 } : { lat: 4.213, lng: 73.54 }; });
  state.orders.forEach(o => { o.destination = o.area === 'Malé' ? { lat: 4.178, lng: 73.515 } : { lat: 4.225, lng: 73.544 }; });
  state.riders.forEach((r, i) => { r.location = { lat: r.area === 'Malé' ? 4.176 + i * 0.001 : 4.214, lng: r.area === 'Malé' ? 73.511 : 73.541, accuracy: 10, capturedAt: time(0), receivedAt: time(0), sequence: 1 }; });
  return state;
}
