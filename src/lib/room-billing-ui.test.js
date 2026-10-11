import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { test } from 'node:test'
import { computed, effectScope, reactive, ref, watch, nextTick } from 'vue'
import { money } from './dining.js'
const extract = name => fs.readFileSync(new URL(`../components/${name}.vue`, import.meta.url), 'utf8').match(/<script setup>([\s\S]*?)<\/script>/)[1].replace(/^import .*$/gm, '')
const flush = () => new Promise(resolve => setImmediate(resolve))
function paymentPage(request, memory = new Map()) {
  const props = reactive({ sessionId: 12 }), user = reactive({ currentStoreId: 1, userInfo: { id: 9 }, hasPermission: () => true }), scope = effectScope()
  const sandbox = { ref, computed, watch, money, request, defineProps: () => props, defineEmits: () => () => {}, useUserStore: () => user,
    localStorage: { getItem: key => memory.get(key) || null, setItem: (key, value) => memory.set(key, value), removeItem: key => memory.delete(key) },
    crypto: { randomUUID: () => 'immutable-request' }, ElMessage: { success() {} }, onBeforeUnmount: fn => { sandbox.unmount = fn } }
  vm.createContext(sandbox)
  scope.run(() => vm.runInContext(extract('RoomBillingSettlement') + '\napi = { bill, cash, confirmed, pending, error, load, settle, recover };', sandbox))
  return { ...sandbox.api, props, user, memory, stop: () => { sandbox.unmount(); scope.stop() } }
}
const quote = sid => ({ sessionId: sid, revision: 4, amountDue: '72.00', settled: false, roomDue: '60.00', itemsDue: '12.00' })

test('ordinary room payment retries the stored original transaction after a lost response', async () => {
  const posts = []
  const page = paymentPage({ get: async () => quote(12), post: async (path, body) => { posts.push({ path, body: JSON.parse(JSON.stringify(body)) }); if (posts.length === 1) throw new Error('连接中断'); return { sessionId: 12, requestKey: body.requestKey, settled: true, change: 8 } } })
  try {
    await flush(); page.cash.value = 80; await nextTick(); page.confirmed.value = true
    await page.settle()
    assert.ok(page.pending.value); assert.ok(page.memory.has('room-billing:1:9'))
    page.cash.value = 999
    await page.recover()
    assert.deepEqual(posts[0], posts[1])
    assert.equal(posts[1].body.cashReceived, '80.00')
    assert.equal(page.bill.value.settled, true); assert.equal(page.pending.value, null)
  } finally { page.stop() }
})

test('late room bill cannot overwrite a newly selected session', async () => {
  let slow
  const page = paymentPage({ get: path => path.includes('/12/') ? new Promise(resolve => { slow = resolve }) : Promise.resolve(quote(13)) })
  try {
    page.props.sessionId = 13; await nextTick(); await flush()
    slow(quote(12)); await flush()
    assert.equal(page.bill.value.sessionId, 13)
  } finally { page.stop() }
})

test('another store cannot recover the previous store cash intent', async () => {
  let posts = 0
  const memory = new Map([['room-billing:1:9', JSON.stringify({ sessionId: 12, body: { requestKey: 'old', expectedAmount: '72.00', cashReceived: '80.00' } })]])
  const page = paymentPage({ get: async () => quote(12), post: async () => { posts++ } }, memory)
  try {
    page.user.currentStoreId = 2; await nextTick(); await flush(); await page.recover()
    assert.equal(posts, 0); assert.equal(page.pending.value, null)
    assert.ok(memory.has('room-billing:1:9'))
  } finally { page.stop() }
})

test('unreadable recovery storage prevents a new cash receipt', async () => {
  let posts = 0
  const page = paymentPage({ get: async () => quote(12), post: async () => { posts++ } }, new Map([['room-billing:1:9', 'broken']]))
  try {
    await flush(); page.cash.value = 80; await nextTick(); page.confirmed.value = true; await page.settle()
    assert.equal(posts, 0); assert.equal(page.pending.value.invalid, true)
  } finally { page.stop() }
})

test('failed billing configuration read cannot submit an empty replacement', async () => {
  let writes = 0
  const sandbox = { ref, computed, defineProps: () => ({ canEdit: true }), request: { get: async () => { throw new Error('网络中断') }, put: async () => { writes++ } }, ElMessage: {}, onMounted() {}, onBeforeUnmount() {} }
  vm.createContext(sandbox)
  vm.runInContext(extract('RoomBillingSettings') + '\napi = { load, save, error };', sandbox)
  await sandbox.api.load(); await sandbox.api.save()
  assert.equal(writes, 0); assert.match(sandbox.api.error.value, /网络中断/)
})
