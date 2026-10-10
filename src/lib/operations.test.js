import test from 'node:test'
import assert from 'node:assert/strict'
import { readOperation, retainOperation, clearOperation, rechargePreview, promotionState, skuLabel } from './operations.js'
test('未知充值结果保留原请求，禁止换金额或门店恢复错单', () => {
  const data = new Map(), storage = { getItem: k => data.get(k), setItem: (k, v) => data.set(k, v), removeItem: k => data.delete(k) }
  const body = { requestKey: 'original', amount: 500, bonus: 50 }
  retainOperation(storage, 1, '/operations/members/8/recharge', body)
  body.amount = 1000
  assert.equal(readOperation(storage, 1).body.amount, 500)
  assert.equal(readOperation(storage, 2), null)
  assert.throws(() => retainOperation(storage, 1, '/operations/members/8/recharge', body), /原操作/)
  clearOperation(storage, 1)
  assert.equal(readOperation(storage, 1), null)
})

test('充值预览保留分币精度，并分别展示本金与赠金', () => {
  assert.deepEqual(rechargePreview({ principal: '80.10', bonus: '9.90' }, 500, 50), { amount: 500, bonus: 50, credited: 550, principalAfter: 580.1, bonusAfter: 59.9, balanceAfter: 640 })
  assert.equal(rechargePreview({ principal: 0.1, bonus: 0.2 }, 0.1, 0.2).balanceAfter, 0.6)
})

test('优惠券时间边界按门店时区判断，停用与发行限制优先展示', () => {
  const row = { active: 1, selfClaim: 1, issued: 2, totalLimit: 10, startsAt: '2026-10-01T00:00:00', endsAt: '2026-10-10T00:00:00' }
  assert.equal(promotionState(row, Date.parse('2026-09-30T15:59:59Z'), true).text, '未开始')
  assert.equal(promotionState(row, Date.parse('2026-10-09T15:59:59Z'), true).text, '可领取')
  assert.equal(promotionState(row, Date.parse('2026-10-09T16:00:00Z'), true).text, '已结束')
  assert.equal(promotionState({ ...row, active: 0 }, Date.parse('2026-10-01T00:00:00Z'), true).text, '已停用')
  assert.equal(promotionState({ ...row, issued: 10 }, Date.parse('2026-10-01T00:00:00Z'), true).text, '已领完')
  assert.equal(promotionState({ ...row, selfClaim: 0 }, Date.parse('2026-10-01T00:00:00Z'), true).text, '门店发放')
})

test('赠品和范围选择显示商品规格，不向运营人员展示原始配置', () => {
  assert.equal(skuLabel({ skuSpecs: '{"杯型":"中杯"}' }, { name: '果汁' }), '果汁 · 中杯')
  assert.equal(skuLabel({ skuSpecs: '[]' }, { name: '果汁' }), '果汁')
})
