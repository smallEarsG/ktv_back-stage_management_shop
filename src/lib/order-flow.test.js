import test from 'node:test'
import assert from 'node:assert/strict'
import { nextOrderStatus, createSubmissionTracker } from './order-flow.js'

test('only forward fulfillment transitions are offered', () => {
  assert.equal(nextOrderStatus(20), 30)
  assert.equal(nextOrderStatus('30'), 40)
  assert.equal(nextOrderStatus(40), 50)
  for (const status of [0, 10, 50, 90, 91, null, undefined]) assert.equal(nextOrderStatus(status), null)
})
test('unconfirmed identical retry retains the original request ID', () => {
  let id = 0
  const tracker = createSubmissionTracker(() => `request-${++id}`)
  const body = { roomId: 'LOCAL-001', items: [{ skuId: 1, qty: 2 }] }
  assert.deepEqual(tracker.prepare(body), tracker.prepare(structuredClone(body)))
  assert.equal(id, 1)
})
test('a changed cart or a confirmed order creates a fresh ID', () => {
  let id = 0
  const tracker = createSubmissionTracker(() => String(++id))
  assert.equal(tracker.prepare({ qty: 1 }).clientOrderNo, '1')
  assert.equal(tracker.prepare({ qty: 2 }).clientOrderNo, '2')
  tracker.clear()
  assert.equal(tracker.prepare({ qty: 2 }).clientOrderNo, '3')
})
