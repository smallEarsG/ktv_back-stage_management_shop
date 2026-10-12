import assert from 'node:assert/strict'
import { test } from 'node:test'
import fs from 'node:fs'
import vm from 'node:vm'
import { computed, effectScope, ref, watch, nextTick } from 'vue'
import * as helpers from './group-buy.js'

const id = 'e6f59745-89a2-4a98-b211-7889ef1fb6fd'
function memory() {
  const data = new Map()
  return { data, getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) }
}
function view(request, storage = memory()) {
  const confirmations = [], prompts = [], warnings = []
  const source = fs.readFileSync(new URL('../views/group-buy/GroupBuyConsole.vue', import.meta.url), 'utf8')
  const script = source.match(/<script setup>([\s\S]*?)<\/script>/)[1].replace(/^import .*$/gm, '')
  const scope = effectScope(), user = { currentStoreId: 1, userInfo: { id: 9, role: 'admin' } }
  const sandbox = { ...helpers, ref, computed, watch, request, localStorage: storage,
    useUserStore: () => user, onMounted: () => {}, ElMessage: { success() {}, warning: text => warnings.push(text) },
    ElMessageBox: { confirm: async text => { confirmations.push(text) }, prompt: async text => { prompts.push(text); return { value: '误选套餐' } } } }
  vm.createContext(sandbox)
  scope.run(() => vm.runInContext(script + '\napi = { channels, platform, input, preparation, selectedId, pending, pendingRecord, error, recoveryError, page, rows, load, inspect, submitVerification, queryRecord, restore, cancelRecord };', sandbox))
  return { ...sandbox.api, storage, confirmations, prompts, warnings, stop: () => scope.stop() }
}
function fakeRequest(post) {
  return { post, get: async path => path === '/group-buy/channels' ? [{ platform: 'DOUYIN', ready: true }] : { list: [], total: 0 } }
}
function prepared(page) {
  page.channels.value = [{ platform: 'MEITUAN', ready: true }]
  page.preparation.value = { id, certificates: [{ id: 'cert-1', title: '双人套餐', payAmount: 99 }] }
  page.selectedId.value = 'cert-1'
}
test('美团是优先入口，未开通时不能发请求，确认金额和撤销说明按餐饮平台区分', async () => {
  const calls = [], page = view({ get: async path => path.endsWith('/channels') ? [{ platform: 'MEITUAN', ready: false }] : { list: [], total: 0 },
    post: async (path, body) => { calls.push({ path, body }); return { id, state: 'VERIFIED', message: '平台暂不允许撤销' } } })
  try {
    assert.equal(page.platform.value, 'MEITUAN'); await page.load(); page.input.value = '010011112345'; await nextTick(); await page.inspect(); assert.equal(calls.length, 0)
    prepared(page); page.preparation.value.amountLabel = '商家实收参考（未扣手续费）'; await page.submitVerification()
    assert.match(page.confirmations[0], /商家实收参考/); assert.doesNotMatch(page.confirmations[0], /顾客实付/)
    await page.cancelRecord({ id, platform: 'MEITUAN', state: 'VERIFIED', title: '双人餐饮套餐' })
    assert.match(page.prompts[0], /原券作废/); assert.match(page.prompts[0], /点评券不支持撤销/); assert.doesNotMatch(page.prompts[0], /恢复可用/)
    assert.equal(page.warnings.at(-1), '平台暂不允许撤销')
  } finally { page.stop() }
})
test('团购意图按门店和员工保存，损坏记录不能被静默忽略', () => {
  const storage = memory()
  helpers.savePending(storage, 1, 9, { id, action: 'verify', certificateId: 'cert-1' })
  assert.equal(helpers.readPending(storage, 1, 9).id, id)
  assert.equal(helpers.readPending(storage, 2, 9), null)
  assert.equal(helpers.readPending(storage, 1, 10), null)
  storage.setItem(helpers.pendingKey(1, 9), 'bad-json')
  assert.throws(() => helpers.readPending(storage, 1, 9))
  assert.equal(helpers.operationResolved({ id, action: 'verify' }, { id, state: 'UNKNOWN', remoteStatus: '平台已使用' }), false)
  assert.equal(helpers.operationResolved({ id, action: 'cancel' }, { id, state: 'CANCEL_UNKNOWN' }), false)
})
test('核销发送前保存原意图，超时后保持原券并使用相同标识重试', async () => {
  const writes = [], storage = memory()
  const page = view(fakeRequest(async (path, body) => {
    assert.equal(helpers.readPending(storage, 1, 9).id, id)
    writes.push({ path, ...body }); throw new Error('timeout')
  }), storage)
  try {
    prepared(page); await page.submitVerification()
    assert.equal(page.pending.value.id, id)
    await page.submitVerification(true)
    assert.equal(writes.length, 2)
    assert.deepEqual(writes[0], writes[1])
    assert.equal(writes[1].certificateId, 'cert-1')
  } finally { page.stop() }
})
test('平台显示已用不能清除未知操作，查询其他券也不能覆盖待确认提示', async () => {
  const page = view(fakeRequest(async path => ({ id: path.includes('other') ? 'other' : id, state: 'UNKNOWN', message: '归属待确认', remoteStatus: '平台显示本店已用' })))
  try {
    helpers.savePending(page.storage, 1, 9, { id, action: 'verify', certificateId: 'cert-1' }); page.restore()
    await page.queryRecord()
    assert.equal(page.pending.value.id, id)
    assert.equal(page.pendingRecord.value.id, id)
    await page.queryRecord('other')
    assert.equal(page.pendingRecord.value.id, id)
  } finally { page.stop() }
})
test('浏览器不能保存恢复记录时不允许发出核销请求', async () => {
  let writes = 0
  const storage = memory(); storage.setItem = () => { throw new Error('storage denied') }
  const page = view(fakeRequest(async () => { writes++ }), storage)
  try { prepared(page); await page.submitVerification(); assert.equal(writes, 0); assert.match(page.error.value, /本地存储/) }
  finally { page.stop() }
})
test('修改券码会丢弃原验券结果，迟到的查询不能覆盖新输入', async () => {
  let resolve
  const page = view(fakeRequest(() => new Promise(done => { resolve = done })))
  try {
    page.platform.value = 'DOUYIN'; page.channels.value = [{ platform: 'DOUYIN', ready: true }]; page.input.value = '123456789012'; await nextTick()
    const inspecting = page.inspect()
    page.input.value = '999999999999'; await nextTick()
    resolve({ id, certificates: [{ id: 'cert-1' }] }); await inspecting
    assert.equal(page.preparation.value, null)
  } finally { page.stop() }
})
test('翻页的旧响应不能覆盖新页，核销入口仍显示已取得的开通状态', async () => {
  const waiting = [], page = view({ get: async (path, config) => path === '/group-buy/channels' ? [{ platform: 'DOUYIN', ready: false }]
    : new Promise(resolve => waiting.push({ page: config.params.page, resolve })) })
  try {
    const first = page.load(); page.page.value = 2; const second = page.load()
    waiting[1].resolve({ list: [{ id: 'page-2' }], total: 40 }); await second
    waiting[0].resolve({ list: [{ id: 'page-1' }], total: 40 }); await first
    assert.equal(page.rows.value[0].id, 'page-2')
  } finally { page.stop() }
})
test('只有平台确认后的核销或撤销才清除当前待确认意图', async () => {
  const page = view(fakeRequest(async () => ({ id, state: 'VERIFIED', message: 'confirmed' })))
  try {
    prepared(page); await page.submitVerification()
    assert.equal(page.pending.value, null)
    assert.equal(helpers.readPending(page.storage, 1, 9), null)
    assert.equal(page.preparation.value, null)
  } finally { page.stop() }
})
