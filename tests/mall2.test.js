import test from 'node:test'
import assert from 'node:assert/strict'
import { parseBatchCsv, canReleaseMallIntent, memberTiersForForm, memberTiersForSave } from '../src/lib/mall2.js'

test('batch CSV preserves quoted commas and refuses malformed or oversized files', () => {
  const columns = ['orderId', 'expectedVersion', 'carrier', 'trackingNo']
  assert.deepEqual(parseBatchCsv('\uFEFForderId,expectedVersion,carrier,trackingNo\r\n1,2,"Company, Inc",SF1\r\n', columns), [{ orderId: '1', expectedVersion: '2', carrier: 'Company, Inc', trackingNo: 'SF1' }])
  assert.throws(() => parseBatchCsv('orderId,expectedVersion,carrier,trackingNo\n1,2,"Bad,SF1', columns), /引号/)
  assert.throws(() => parseBatchCsv('orderId,expectedVersion,carrier,trackingNo\n' + '1,2,SF,SF1\n'.repeat(51), columns), /最多50/)
  assert.throws(() => parseBatchCsv('orderId,carrier\n1,SF', columns), /表头/)
})

test('permission loss preserves the original mall operation for the original account to recover', () => {
  assert.equal(canReleaseMallIntent({ definitive: true, code: 401 }), false)
  assert.equal(canReleaseMallIntent({ definitive: true, response: { status: 403 } }), false)
  assert.equal(canReleaseMallIntent({ definitive: true, code: 400 }), true)
  assert.equal(canReleaseMallIntent({ definitive: false }), false)
})

test('merchant-friendly discount rates preserve the server financial units exactly', () => {
  const tiers = [{ name: '普通会员', minGrowth: 0, discountBps: 10000 }, { name: '银卡', minGrowth: 500, discountBps: 9500 }]
  const form = memberTiersForForm(tiers)
  assert.equal(form[0].discountRate, 10)
  assert.equal(form[1].discountRate, 9.5)
  assert.deepEqual(memberTiersForSave(form), tiers)
  assert.throws(() => memberTiersForSave([{ discountRate: 0 }]), /折扣/)
  assert.throws(() => memberTiersForSave([{ discountRate: 9.5555 }]), /折扣/)
})
