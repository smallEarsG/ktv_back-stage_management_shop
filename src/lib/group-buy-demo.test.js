import assert from 'node:assert/strict'
import { test } from 'node:test'
import fs from 'node:fs'
import vm from 'node:vm'
import { webcrypto } from 'node:crypto'
import { computed, effectScope, reactive, ref, watch, nextTick } from 'vue'
import * as helpers from './group-buy-demo.js'

const visit = { id: 'visit-1', roomId: 'SIM-101', state: 'OPEN', revision: 1, includedMinutes: 180, includedDrinks: 2 }
const state = () => ({ rooms: [{ id: 'SIM-101', state: 'OPEN' }, { id: 'SIM-102', state: 'IDLE' }], extras: [{ id: 'DRINK', title: '模拟饮料', price: 10 }], vouchers: [], visits: [{ ...visit }], reconciliation: null })
const quote = (minutes = 180, revision = 1) => ({ revision, minutes, roomGross: minutes, itemGross: 0, grossAmount: minutes, packageDeduction: Math.min(minutes, 180), amountDue: Math.max(0, minutes - 180), platformPaid: 99, platformFee: 2.97, platformNet: 96.03, items: [] })
function memory() {
  const data = new Map()
  return { data, getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) }
}
function view(request, storage = memory()) {
  const source = fs.readFileSync(new URL('../views/group-buy/GroupBuyDemoConsole.vue', import.meta.url), 'utf8')
  const script = source.match(/<script setup>([\s\S]*?)<\/script>/)[1].replace(/^import .*$/gm, '')
  const scope = effectScope(), user = reactive({ currentStoreId: 1, userInfo: { id: 9, role: 'admin' } })
  const sandbox = { ...helpers, ref, computed, watch, request, localStorage: storage, crypto: webcrypto,
    demoRequestKey: () => webcrypto.randomUUID(), useUserStore: () => user, onMounted: () => {}, onBeforeUnmount: () => {},
    ElMessage: { success() {} }, ElMessageBox: { prompt: async () => ({ value: '误选券' }) } }
  vm.createContext(sandbox)
  scope.run(() => vm.runInContext(script + '\napi = { capabilities, data, loading, busy, error, pending, recoveryError, visitId, minutes, quote, cashReceived, cashConfirmed, canSettle, canConsume, load, loadQuote, perform, restore, recover, settle, cancelVoucher };', sandbox))
  return { ...sandbox.api, storage, user, stop: () => scope.stop() }
}
function fakeRequest(post = async () => visit) {
  return { post, get: async (path, config) => path.endsWith('/capabilities') ? { enabled: true, simulation: true } : path.endsWith('/state') ? state() : quote(config?.params.minutes) }
}
test('模拟通道未启用时不读取模拟营业数据，也不提交写操作', async () => {
  const calls = [], page = view({ get: async path => { calls.push(path); return { enabled: false, simulation: true } }, post: async () => { throw new Error('must not write') } })
  try {
    await page.load(); await page.perform('/group-buy/demo/redeem', { voucherId: 'v-1', roomId: 'SIM-101' }, '核销开台')
    assert.deepEqual(calls, ['/group-buy/demo/capabilities']); assert.equal(page.pending.value, null); assert.equal(page.data.value, null)
  } finally { page.stop() }
})
test('请求发出前保存模拟原意图，超时和重新打开页面后恢复使用原标识', async () => {
  const storage = memory(), calls = [], request = fakeRequest(async (path, body) => {
    assert.equal(helpers.readDemoPending(storage, 1, 9).body.requestKey, body.requestKey)
    calls.push({ path, body: JSON.parse(JSON.stringify(body)) }); throw new Error('timeout')
  })
  const first = view(request, storage)
  try { await first.load(); await first.perform('/group-buy/demo/visits/visit-1/items', { skuId: 'DRINK', qty: 3 }, '添加消费商品'); assert.equal(first.canConsume.value, false); assert.match(first.error.value, /原模拟操作/); await first.recover() }
  finally { first.stop() }
  const reopened = view(request, storage)
  try { reopened.restore(); await reopened.load(); await reopened.recover(); assert.equal(calls.length, 3); assert.deepEqual(calls[0], calls[1]); assert.deepEqual(calls[1], calls[2]); assert.equal(reopened.pending.value.body.qty, 3) }
  finally { reopened.stop() }
})
test('再次核销后自动切到新开台，使用新套餐包含的时长初始化账单', async () => {
  let opened = false
  const nextVisit = { ...visit, id: 'visit-2', roomId: 'SIM-102', includedMinutes: 240, includedDrinks: 4 }
  const page = view({ post: async () => { opened = true; return nextVisit }, get: async (path, config) => {
    if (path.endsWith('/capabilities')) return { enabled: true, simulation: true }
    if (path.endsWith('/state')) return { ...state(), visits: [{ ...visit, state: 'SETTLED' }, ...(opened ? [nextVisit] : [])] }
    return quote(config.params.minutes)
  } })
  try {
    await page.load(); assert.equal(page.visitId.value, 'visit-1')
    await page.perform('/group-buy/demo/redeem', { voucherId: 'v-2', roomId: 'SIM-102' }, '核销开台')
    assert.equal(page.visitId.value, 'visit-2'); assert.equal(page.minutes.value, 240); assert.equal(page.quote.value.minutes, 240)
  } finally { page.stop() }
})
test('存储不能保存和损坏恢复记录都阻止发送，且恢复记录按门店和员工隔离', async () => {
  const storage = memory(); storage.setItem = () => { throw new Error('denied') }
  let writes = 0
  const page = view(fakeRequest(async () => { writes++ }), storage)
  try { await page.load(); await page.perform('/group-buy/demo/redeem', { voucherId: 'v-1', roomId: 'SIM-101' }, '核销开台'); assert.equal(writes, 0); assert.match(page.error.value, /本地存储/) }
  finally { page.stop() }
  const safe = memory(), operation = { path: '/group-buy/demo/reconcile', body: { requestKey: 'same-key' }, label: '对账' }
  helpers.saveDemoPending(safe, 1, 9, operation)
  assert.equal(helpers.readDemoPending(safe, 2, 9), null); assert.equal(helpers.readDemoPending(safe, 1, 10), null)
  safe.setItem(helpers.demoPendingKey(1, 9), 'bad-json')
  const broken = view(fakeRequest(async () => { writes++ }), safe)
  try { broken.restore(); await broken.load(); await broken.perform('/group-buy/demo/reconcile', {}, '对账'); assert.equal(writes, 0); assert.match(broken.recoveryError.value, /损坏/) }
  finally { broken.stop() }
})
test('消费分钟改变会作废原报价，迟到的报价不能恢复旧应收', async () => {
  let finish
  const request = fakeRequest(), page = view(request)
  try {
    await page.load(); assert.equal(page.quote.value.minutes, 180)
    request.get = (path, config) => new Promise(resolve => { finish = () => resolve(quote(config.params.minutes)) })
    page.minutes.value = 240; const first = page.loadQuote(); page.minutes.value = 270
    finish(); await first; assert.equal(page.quote.value, null); assert.equal(page.canSettle.value, false)
  } finally { page.stop() }
})
test('结账使用服务器报价而非前端推算，实收更改后需要重新确认', async () => {
  const writes = [], page = view(fakeRequest(async (path, body) => { writes.push({ path, body }); return { ...visit, state: 'SETTLED' } }))
  try {
    await page.load(); page.minutes.value = 240; await page.loadQuote()
    page.quote.value = { ...quote(240, 7), amountDue: 108, packageDeduction: 200 }
    page.cashReceived.value = 110; page.cashConfirmed.value = true
    page.cashReceived.value = 120; assert.equal(page.cashConfirmed.value, false)
    await page.settle(); assert.equal(writes.length, 0)
    page.cashConfirmed.value = true; await page.settle()
    assert.equal(writes.length, 1); assert.equal(writes[0].body.expectedAmount, 108); assert.equal(writes[0].body.revision, 7); assert.equal(writes[0].body.minutes, 240); assert.equal(writes[0].body.cashReceived, 120)
    assert.equal(page.pending.value, null)
  } finally { page.stop() }
})
test('服务器拒绝过期报价后清除未执行意图并显示原因，不静默丢失错误', async () => {
  const page = view(fakeRequest(async () => { const error = new Error('账单已更新，请重新核算'); error.response = { status: 409, data: { message: error.message } }; throw error }))
  try {
    await page.load(); await page.perform('/group-buy/demo/visits/visit-1/settle', { revision: 1, minutes: 180, expectedAmount: 0, cashReceived: 0 }, '结账')
    assert.equal(page.pending.value, null); assert.match(page.error.value, /账单已更新/); assert.equal(helpers.readDemoPending(page.storage, 1, 9), null)
  } finally { page.stop() }
})
test('切换门店后旧操作响应不能清除新门店恢复意图或覆盖数据', async () => {
  let finish
  const page = view(fakeRequest(() => new Promise(resolve => { finish = resolve })))
  try {
    await page.load(); const old = page.perform('/group-buy/demo/reconcile', {}, '对账')
    const newOperation = { path: '/group-buy/demo/reconcile', body: { requestKey: 'store-2-key' }, label: '新门店对账' }
    helpers.saveDemoPending(page.storage, 2, 9, newOperation); page.user.currentStoreId = 2; await nextTick()
    finish({}); await old; await nextTick()
    assert.equal(page.pending.value.body.requestKey, 'store-2-key'); assert.equal(helpers.readDemoPending(page.storage, 2, 9).body.requestKey, 'store-2-key')
    assert.ok(helpers.readDemoPending(page.storage, 1, 9))
  } finally { page.stop() }
})
test('员工不能调用撤销，管理员也只能撤销服务端标记未消费的券', async () => {
  let writes = 0
  const page = view(fakeRequest(async () => { writes++ }))
  try {
    await page.load(); page.user.userInfo.role = 'staff'; await page.cancelVoucher({ id: 'v-1', canCancel: true }); assert.equal(writes, 0)
    page.user.userInfo.role = 'admin'; await page.cancelVoucher({ id: 'v-1', canCancel: false }); assert.equal(writes, 0)
    await page.cancelVoucher({ id: 'v-1', canCancel: true }); assert.equal(writes, 1)
  } finally { page.stop() }
})
