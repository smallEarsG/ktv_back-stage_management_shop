import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cashierReceipt, remainingPaymentSeconds, recoveryKey } from './cashier-result.js'
test('cash, hang and unconfirmed scan receipts describe actual collection', () => {
  assert.equal(cashierReceipt({ status: 50, payMethod: 2, payStatus: 2 }).type, 'success')
  assert.match(cashierReceipt({ status: 20, payMethod: 3, payStatus: 0 }).text, /尚未收款/)
  assert.equal(cashierReceipt({ status: 10, payMethod: 1, payStatus: 0 }).type, 'warning')
  assert.doesNotMatch(cashierReceipt({ status: 10, payMethod: 1, payStatus: 0 }).text, /已完成/)
  assert.equal(cashierReceipt({ status: 90, payMethod: 1, payStatus: 3 }).type, 'info')
})
test('countdown uses server time, stops at zero, and recovery is scoped', () => {
  const order = { serverNow: '2026-10-09T10:00:00', expireAt: '2026-10-09T10:15:00' }
  assert.equal(remainingPaymentSeconds(order), 900)
  assert.equal(remainingPaymentSeconds(order, 901), 0)
  assert.equal(remainingPaymentSeconds({ expireAt: 'invalid', serverNow: 'invalid' }), null)
  assert.notEqual(recoveryKey(1, 1), recoveryKey(2, 1))
  assert.notEqual(recoveryKey(1, 1), recoveryKey(1, 2))
})
