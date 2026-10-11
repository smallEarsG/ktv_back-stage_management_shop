import assert from 'node:assert/strict'
import { test } from 'node:test'
import fs from 'node:fs'
import vm from 'node:vm'
import { computed, effectScope, ref, watch, reactive, nextTick } from 'vue'
import * as helpers from './group-buy-fulfillment.js'
const id = 'e6f59745-89a2-4a98-b211-7889ef1fb6fd'
function memory() { const data = new Map(); return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) } }
function page(request, storage = memory()) {
  const source = fs.readFileSync(new URL('../views/group-buy/GroupBuyFulfillmentPanel.vue', import.meta.url), 'utf8').match(/<script setup>([\s\S]*?)<\/script>/)[1].replace(/^import .*$/gm, '')
  const scope = effectScope(), user = reactive({ currentStoreId: 1, userInfo: { id: 9, role: 'admin' } })
  const sandbox = { ...helpers, computed, ref, watch, request, localStorage: storage, crypto: { randomUUID: () => 'original-key' }, money: value => Number(value).toFixed(2),
    useUserStore: () => user, defineProps: () => ({ records: [], demoEnabled: true }), defineEmits: () => () => {}, onMounted: () => {}, onBeforeUnmount: callback => { sandbox.unmount = callback }, ElMessage: { success() {} } }
  vm.createContext(sandbox)
  scope.run(() => vm.runInContext(source + '\napi = { pending, error, recoveryError, selected, bill, dialogVisible, cash, cashConfirmed, settleReady, restore, recover, perform, fulfill, settle, loadBill, load, options };', sandbox))
  return { ...sandbox.api, user, storage, stop: () => { sandbox.unmount(); scope.stop() } }
}
const options = { packages: [], rooms: [], skus: [] }
const get = async path => path.endsWith('/options') ? options : { list: [], platformGross: 0, fees: 0, actual: 0, difference: 0 }
test('正式联动原操作按门店员工隔离，损坏数据阻止继续操作', () => {
  const storage = memory(), operation = { path: `/group-buy/records/${id}/fulfill`, body: { roomId: 'A' }, label: '开台' }
  helpers.saveFulfillmentPending(storage, 1, 9, operation)
  assert.deepEqual(helpers.readFulfillmentPending(storage, 1, 9), operation)
  assert.equal(helpers.readFulfillmentPending(storage, 2, 9), null)
  storage.setItem(helpers.fulfillmentPendingKey(1, 9), 'broken')
  assert.throws(() => helpers.readFulfillmentPending(storage, 1, 9))
})
test('开台超时后重试原包厢原核销记录，确认真实场次后才清除意图', async () => {
  const writes = [], view = page({ get, post: async (path, body) => { writes.push({ path, body }); if (writes.length === 1) throw new Error('timeout'); return { redemptionId: id, sessionId: 10, packageOrderId: 11 } } })
  try {
    await view.perform(`/group-buy/records/${id}/fulfill`, { roomId: 'A', headcount: 2 }, '原券开台')
    assert.equal(view.pending.value.body.roomId, 'A'); await view.recover()
    assert.deepEqual(writes[0], writes[1]); assert.equal(view.pending.value, null)
  } finally { view.stop() }
})
test('联动返回了其他场次或错误小票时保留待确认记录', async () => {
  const view = page({ get, post: async () => ({ redemptionId: 'other', sessionId: 10, packageOrderId: 11 }) })
  try {
    await view.perform(`/group-buy/records/${id}/fulfill`, { roomId: 'A' }, '开台')
    assert.ok(view.pending.value); assert.match(view.error.value, /原操作不符/)
    assert.equal(helpers.validateFulfillmentResponse({ path: `/group-buy/records/${id}/settle`, body: { requestKey: 'original' } }, { redemptionId: id, requestKey: 'wrong' }), false)
  } finally { view.stop() }
})
test('无法保存原联动意图时不会请求真实订单开台', async () => {
  let writes = 0; const storage = memory(); storage.setItem = () => { throw new Error('storage blocked') }
  const view = page({ get, post: async () => { writes++ } }, storage)
  try { await view.perform(`/group-buy/records/${id}/fulfill`, { roomId: 'A' }, '开台'); assert.equal(writes, 0) }
  finally { view.stop() }
})
test('切换核销记录后迟到的原账单不能覆盖新消费', async () => {
  let finish; const view = page({ get: () => new Promise(resolve => { finish = resolve }) })
  try {
    view.selected.value = { id }; const reading = view.loadBill(); view.selected.value = { id: 'other' }
    finish({ redemptionId: id, amountDue: 70 }); await reading; assert.equal(view.bill.value, null)
  } finally { view.stop() }
})
test('结账只提交追加应收和服务端版本，迟到响应不能清除其他门店原操作', async () => {
  let finish; const writes = [], view = page({ get, post: async (path, body) => { writes.push({ path, body }); return new Promise(resolve => { finish = resolve }) } })
  try {
    view.selected.value = { id }; view.bill.value = { redemptionId: id, revision: 3, amountDue: 70 }; view.cash.value = 100
    await nextTick(); view.cashConfirmed.value = true; const settling = view.settle()
    assert.equal(writes[0].body.expectedAmount, 70); assert.equal(writes[0].body.cashReceived, 100); assert.equal(writes[0].body.revision, 3)
    view.user.currentStoreId = 2; await nextTick(); finish({ redemptionId: id, requestKey: 'original-key' }); await settling
    assert.ok(helpers.readFulfillmentPending(view.storage, 1, 9)); assert.equal(view.pending.value, null)
  } finally { view.stop() }
})
