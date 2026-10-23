import { canReleaseRecovery } from './recovery-storage.js'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { test } from 'node:test'
import { computed, reactive, ref } from 'vue'
import * as helpers from './mall.js'
import { skuFields, skuPayload } from './mall-product-editor.js'
import { canReleaseMallIntent } from './mall2.js'

const memory = () => { const values = new Map(); return { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) } }
const op = () => ({ path: '/skus/12/stock', body: { requestKey: 'original-key', expectedVersion: 1, delta: 2, reason: '盘点' }, targetId: 12, label: '库存调整', createdAt: '2026-10-17T00:00:00Z' })
function page(request = {}, storage = memory(), tab = 'orders') {
  const user = { currentStoreId: 1, userInfo: { id: 9 }, product: () => ({ application: { id: 7 } }), canTradeProduct: () => true, hasPermission: () => true }
  const sandbox = { createRecoveryStorage: raw => raw, canReleaseRecovery, ...helpers, skuFields, skuPayload, canReleaseMallIntent, ref, computed, reactive, useRoute: () => ({ meta: { mallTab: tab } }), useUserStore: () => user, request: { get: async () => ({ list: [], total: 0 }), ...request }, newRequestKey: () => 'generated-key', localStorage: storage, onMounted() {}, onBeforeUnmount() {}, ElMessage: { success() {}, warning() {} }, FormData, console }
  vm.createContext(sandbox)
  const source = fs.readFileSync(new URL('../views/mall/MallConsole.vue', import.meta.url), 'utf8').match(/<script setup>([\s\S]*?)<\/script>/)[1].replace(/^import .*$/gm, '')
  vm.runInContext(source + '\napi = { load, loadCapabilities, perform, recover, open, submit, form, editor, editorUncertain, rows, error, pending, recoveryError, capabilities, capabilityError, selectQueue, queue, status, page, queueCounts, quickFulfill };', sandbox)
  return { ...sandbox.api, storage, user }
}

test('pending mall recovery is isolated by store, application and operator and rejects corrupt records', () => {
  const storage = memory(), operation = op()
  helpers.retainMallPending(storage, 1, 7, 9, operation)
  assert.deepEqual(helpers.readMallPending(storage, 1, 7, 9), operation)
  for (const scope of [[2, 7, 9], [1, 8, 9], [1, 7, 10]]) assert.equal(helpers.readMallPending(storage, ...scope), null)
  assert.throws(() => helpers.retainMallPending(storage, 1, 7, 9, { ...operation, body: { ...operation.body, delta: 3 } }), /原商城操作/)
  storage.setItem(helpers.mallPendingKey(1, 7, 9), '{broken')
  assert.throws(() => helpers.readMallPending(storage, 1, 7, 9), /损坏/)
})
test('network uncertainty survives remount and reuses the original request and version', async () => {
  const posts = [], storage = memory()
  let first = true
  const request = { post: async (path, body) => { posts.push(JSON.parse(JSON.stringify({ path, body }))); if (first) { first = false; throw new Error('连接中断') }; return { id: 12, stock: 22 } } }
  const original = page(request, storage)
  await original.perform(op())
  assert.equal(original.pending.value.body.requestKey, 'original-key')
  assert.match(original.error.value, /结果未确认/)
  const reopened = page(request, storage)
  await reopened.recover()
  assert.deepEqual(posts[0], posts[1])
  assert.equal(reopened.pending.value, null)
  assert.equal(helpers.readMallPending(storage, 1, 7, 9), null)
})
test('wrong response identity retains recovery while a definitive rejection clears it', async () => {
  const wrong = page({ post: async () => ({ id: 999 }) })
  await wrong.perform(op())
  assert.equal(wrong.pending.value.targetId, 12)
  const denied = page({ post: async () => { const error = new Error('无权操作'); error.definitive = true; throw error } })
  await denied.perform(op())
  assert.equal(denied.pending.value, null)
  assert.match(denied.error.value, /无权/)
})
test('capability failure never blocks order history and can be retried independently', async () => {
  let failed = true
  const view = page({ get: async path => { if (path.endsWith('/capabilities')) { if (failed) throw new Error('能力状态暂不可用'); return { paymentMode: 'DEMO' } }; return { list: [{ id: 21 }], total: 1 } } })
  await Promise.allSettled([view.load(), view.loadCapabilities()])
  assert.equal(view.rows.value[0].id, 21)
  assert.match(view.capabilityError.value, /暂不可用/)
  failed = false; await view.loadCapabilities()
  assert.equal(view.capabilities.value.paymentMode, 'DEMO')
  assert.equal(view.capabilityError.value, '')
})
test('product edits preserve SKU identity and do not overwrite existing stock', async () => {
  let payload
  const view = page({ put: async (_, body) => { payload = JSON.parse(JSON.stringify(body)); return { id: 4 } } }, memory(), 'products')
  view.open('product', { id: 4, version: 3, name: '咖啡豆', skus: [{ id: 12, skuCode: 'BEAN-1', specs: { 重量: '500g' }, price: 60, stock: 25 }] })
  await view.submit()
  assert.equal(payload.expectedVersion, 3)
  assert.equal(payload.skus[0].id, 12)
  assert.equal(Object.hasOwn(payload.skus[0], 'stock'), false)
  assert.deepEqual(payload.skus[0].specs, { 重量: '500g' })
})
test('spec editing rejects ambiguous duplicate names', () => {
  assert.deepEqual(helpers.parseMallSpecs('颜色=蓝色;容量=500ml'), { 颜色: '蓝色', 容量: '500ml' })
  assert.throws(() => helpers.parseMallSpecs('颜色=蓝;颜色=红'), /重复/)
})

test('order queues reset stale filters and use server counts across pages', async () => {
  let params
  const view = page({ get: async (_, options) => { params = options.params; return { list: [{ id: 1 }], total: 42, queueCounts: { ALL: 60, WAIT_SHIP: 42 } } } })
  view.page.value = 3; view.status.value = 'COMPLETED'
  view.selectQueue('WAIT_SHIP')
  await view.load()
  assert.equal(view.page.value, 1)
  assert.equal(view.status.value, '')
  assert.equal(params.queue, 'WAIT_SHIP')
  assert.equal(view.queueCounts.value.WAIT_SHIP, 42)
})

test('quick fulfillment fetches current detail and keeps its version and remaining quantities', async () => {
  let reads = 0
  const fresh = { id: 4, version: 7, status: 'PARTIALLY_SHIPPED', payStatus: 'PAID', fulfillmentType: 'EXPRESS', marketing: {}, items: [{ id: 10, name: '商品', qty: 5, shippedQty: 2, unshippedAftersaleQty: 1 }] }
  const view = page({ get: async () => { reads++; return fresh } })
  await view.quickFulfill({ id: 4, version: 1, status: 'PAID' })
  assert.equal(reads, 1)
  assert.equal(view.editor.value, 'ship')
  assert.equal(view.form.version, 7)
  assert.equal(view.form.shipItems[0].max, 2)
  assert.equal(view.form.shipItems[0].qty, 0)
  const changed = page({ get: async path => path.endsWith('/orders/4') ? { ...fresh, status: 'AFTERSALE' } : { list: [], total: 0 } })
  await changed.quickFulfill({ id: 4 })
  assert.equal(changed.editor.value, '')
})
test('refund retries validate the original aftersale and refund number rather than mismatched internal ids', () => {
  const operation = { ...op(), path: '/aftersales/12/refund-retry' }
  assert.equal(helpers.verifyMallResult(operation, { id: 99, aftersaleId: 12, refundNo: 'MR-original', status: 'PROCESSING' }), true)
  assert.equal(helpers.verifyMallResult(operation, { id: 12, aftersaleId: 99, refundNo: 'MR-other' }), false)
})

test('read-only product staff cannot open or submit create, edit or stock operations', async () => {
  const writes = []
  const view = page({ post: async (...args) => writes.push(args), put: async (...args) => writes.push(args) }, memory(), 'products')
  view.user.hasPermission = permission => permission === 'product:view'
  for (const [type, row] of [['product', {}], ['product', { id: 4 }], ['stock', { id: 12 }], ['category', {}]]) view.open(type, row)
  assert.equal(view.editor.value, '')
  view.editor.value = 'product'; Object.assign(view.form, { id: 4, name: '只读商品', skus: [] })
  await view.submit()
  assert.equal(writes.length, 0)
})

test('dispatch authority cannot open pickup or edit products and permission loss blocks original retry', async () => {
  const writes = [], storage = memory()
  const view = page({ post: async (...args) => writes.push(args) }, storage)
  view.user.hasPermission = permission => permission === 'order:view' || permission === 'order:ship'
  view.open('pickup', { id: 4 }); assert.equal(view.editor.value, '')
  view.open('product', { id: 4 }); assert.equal(view.editor.value, '')
  view.open('ship', { id: 4 }); assert.equal(view.editor.value, 'ship')
  const original = { ...op(), path: '/orders/4/ship', targetId: 4 }
  helpers.retainMallPending(storage, 1, 7, 9, original)
  const restored = page({ post: async (...args) => writes.push(args) }, storage)
  restored.user.hasPermission = permission => permission === 'order:view'
  await restored.recover()
  assert.equal(writes.length, 0)
  assert.equal(restored.pending.value.body.requestKey, original.body.requestKey)
  assert.match(restored.error.value, /无权/)
})
