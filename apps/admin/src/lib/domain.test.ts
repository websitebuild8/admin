import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand, stateSchema } from './domain';
import { createDemoState } from './demo-data';

test('fixture matches the shared contract', () => { assert.ok(stateSchema.safeParse(createDemoState()).success); });
test('unverified payments cannot progress', () => { const s = createDemoState(); s.orders[0].paid = false; assert.throws(() => applyCommand(s, { type: 'order-status', id: s.orders[0].id, status: 'Preparing' }, 'admin'), /verified paid/); });
test('status changes cannot skip fulfilment steps', () => { const s = createDemoState(); assert.throws(() => applyCommand(s, { type: 'order-status', id: s.orders[0].id, status: 'Delivered' }, 'admin'), /cannot move/); });
test('dispatch needs a rider', () => { const s = createDemoState(); s.orders[0].status = 'Ready for pickup'; assert.throws(() => applyCommand(s, { type: 'order-status', id: s.orders[0].id, status: 'On the way' }, 'admin'), /Assign an active/); });
test('a busy rider cannot be assigned twice', () => { const s = createDemoState(); assert.throws(() => applyCommand(s, { type: 'assign-rider', id: s.orders[0].id, riderId: 'r1' }, 'admin'), /already has/); });
test('pending partners need document verification', () => { assert.throws(() => applyCommand(createDemoState(), { type: 'partner-status', kind: 'restaurant', id: 'green-bowl', status: 'Active', verified: false, reason: '' }, 'admin'), /Verify/); });
test('refund reviews reserve the refundable amount', () => { const s = createDemoState(); const command = { type: 'request-refund' as const, id: s.orders[0].id, amount: s.orders[0].amount, reason: 'Restaurant could not fulfil the order' }; const after = applyCommand(s, command, 'admin'); assert.equal(after.refunds[0].status, 'Requested'); assert.throws(() => applyCommand(after, command, 'admin'), /exceeds/); });
test('commands append attributable audit records without mutating input', () => { const s = createDemoState(); const after = applyCommand(s, { type: 'resolve-ticket', id: 'CASE-102' }, 'clerk-admin-123'); assert.equal(s.tickets[0].status, 'Open'); assert.equal(after.tickets[0].status, 'Resolved'); assert.equal(after.activity[0].actor, 'clerk-admin-123'); });
