import test from 'node:test'
import assert from 'node:assert/strict'
import { formatOrderAttributes, orderItemProgressText } from './order-attributes.js'

test('historical named arrays and current object attributes use the same readable format', () => {
  const old = [{ name: '容量', value: '330ml' }, { name: '口味', value: ['少辣', '少盐'] }]
  const current = { 容量: '330ml', 口味: ['少辣', '少盐'] }
  for (const raw of [old, JSON.stringify(old), current, JSON.stringify(current)]) assert.equal(formatOrderAttributes(raw), '容量：330ml · 口味：少辣、少盐')
  assert.equal(formatOrderAttributes(old, { labels: false }), '330ml / 少辣、少盐')
})
test('plain arrays, scalar strings, invalid JSON and empty attributes have safe readable fallbacks', () => {
  assert.equal(formatOrderAttributes(['大杯', '常温']), '大杯 · 常温')
  assert.equal(formatOrderAttributes('["大杯","常温"]', { labels: false }), '大杯 / 常温')
  for (const value of ['大杯', '{bad-json', '<script>example</script>']) assert.equal(formatOrderAttributes(value), value)
  assert.equal(formatOrderAttributes({ 辣度: 0 }), '辣度：0')
  assert.equal(formatOrderAttributes([{ name: {}, value: '大杯' }]), '大杯')
  for (const value of [null, undefined, '', [], {}, [{ ignored: {} }], { 选项: {} }]) assert.equal(formatOrderAttributes(value), '')
})
test('return and money-refund quantities remain separate from preparation and delivered quantities', () => {
  assert.equal(orderItemProgressText({ qty: 4, remainingQty: 3, state: 'PENDING', canceledQty: 1, pendingReturnQty: 1, refundedQty: 2 }), '待制作 2 份 · 退菜处理中 1 份，暂缓制作 · 已退菜 1 份 · 已退款 2 份')
  assert.equal(orderItemProgressText({ qty: 2, state: 'SERVED', remainingQty: 2, canceledQty: 0, pendingReturnQty: 0, refundedQty: 2 }), '已送达 2 份 · 已退款 2 份')
  assert.equal(orderItemProgressText({ qty: 2, remainingQty: 0, canceledQty: 2, refundedQty: 2, pendingReturnQty: 0, state: 'PENDING' }), '已退菜 2 份 · 已退款 2 份')
  assert.equal(orderItemProgressText({ qty: 1 }), '')
})
