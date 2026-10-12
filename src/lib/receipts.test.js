import { test } from 'node:test'
import assert from 'node:assert/strict'
import { receiptHtml } from './dining.js'
import { createTelemetryReporter } from './telemetry.js'

test('kitchen receipt formats legacy specifications and escapes every merchant field', () => {
  const html = receiptHtml({ storeName: '<script>店名</script>', station: '后厨', roomId: 'A', headcount: 2, pendingReturn: true, items: [{ name: '咖啡', qty: 2, selectedAttrsJson: '[{"name":"杯型","value":"大杯"}]', note: '<img onerror=x>' }] }, { paperWidth: 58 })
  assert.match(html, /58mm auto/); assert.match(html, /杯型：大杯/); assert.match(html, /退菜处理中/); assert.match(html, /&lt;script&gt;/); assert.doesNotMatch(html, /<img onerror/)
})
test('settlement receipt shows recorded amount tender change and item notes', () => {
  const html = receiptHtml({ kind: 'SETTLEMENT', storeName: '餐馆', amount: 12, tender: 20, change: 8, items: [{ name: '饮料', qty: 1, payableAmount: 12, note: '少冰' }] })
  assert.match(html, /本次应收：¥12.00/); assert.match(html, /现金实收：¥20.00/); assert.match(html, /找零：¥8.00/); assert.match(html, /单品备注：少冰/)
})
test('error telemetry strips secrets and never sends request bodies', async () => {
  const sent = [], report = createTelemetryReporter({ baseURL: '/demo/api', getToken: () => 'test-token', getStore: () => 1, send: async (...args) => sent.push(args), now: () => 50000 })
  await report('NETWORK', '/orders/112233?password=secret'); await report('NETWORK', '/orders/112233?password=secret')
  assert.equal(sent.length, 1); assert.deepEqual(JSON.parse(sent[0][1].body), { kind: 'NETWORK', route: '/orders/:value' }); assert.equal(sent[0][0], '/demo/api/telemetry')
})
test('telemetry transport failure cannot propagate into the business flow', async () => {
  const report = createTelemetryReporter({ baseURL: '/api', getToken: () => 'test-token', getStore: () => 1, send: async () => { throw new Error('offline') } })
  await assert.doesNotReject(() => report('RUNTIME', '/dining/seats'))
})
