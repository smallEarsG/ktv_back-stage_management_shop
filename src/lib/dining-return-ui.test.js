import { canReleaseRecovery } from './recovery-storage.js'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { test } from 'node:test'
import { computed, effectScope, reactive, ref, watch, nextTick } from 'vue'

const source = fs.readFileSync(new URL('../components/DiningReturnRequest.vue', import.meta.url), 'utf8').match(/<script setup>([\s\S]*?)<\/script>/)[1].replace(/^import .*$/gm, '')
function page(request) {
  const props = reactive({ order: { id: 34, items: [{ id: 7, name: '饮料', returnableQty: 2, refundableQty: 3 }] } })
  const user = reactive({ currentStoreId: 1, userInfo: { id: 9 }, hasPermission: () => true }), memory = new Map(), scope = effectScope()
  const sandbox = { createRecoveryStorage: raw => raw, canReleaseRecovery, ref, computed, watch, request, defineProps: () => props, defineEmits: () => () => {}, useUserStore: () => user,
    localStorage: { getItem: key => memory.get(key) || null, setItem: (key, value) => memory.set(key, value), removeItem: key => memory.delete(key) },
    crypto: { randomUUID: () => 'return-original' }, ElMessage: { success() {} }, onBeforeUnmount: fn => { sandbox.unmount = fn } }
  vm.createContext(sandbox)
  scope.run(() => vm.runInContext(source + '\napi = { kind, reason, items, pending, error, submit, recover };', sandbox))
  return { ...sandbox.api, props, user, memory, stop: () => { sandbox.unmount(); scope.stop() } }
}

test('merchant dish return recovers the original intent after a lost response', async () => {
  const posts = []
  const p = page({ post: async (path, body) => { posts.push(JSON.parse(JSON.stringify(body))); if (posts.length === 1) throw new Error('连接中断'); return { orderId: body.orderId, requestKey: body.requestKey, kind: body.kind } } })
  try {
    p.reason.value = '取消未制作饮料'; p.items.value[0].qty = 2
    await p.submit(); assert.ok(p.pending.value)
    p.reason.value = '修改的原因'; p.items.value[0].qty = 1
    await p.recover()
    assert.deepEqual(posts[0], posts[1]); assert.equal(posts[1].kind, 'RETURN'); assert.equal(posts[1].items[0].qty, 2)
    assert.equal(p.pending.value, null); assert.equal(p.memory.size, 0)
  } finally { p.stop() }
})

test('merchant return blocks duplicate writes and isolates recovery by store', async () => {
  let writes = 0
  const p = page({ post: async () => { writes++; throw new Error('连接中断') } })
  try {
    p.reason.value = '退菜'; await p.submit(); await p.submit(); assert.equal(writes, 1)
    p.user.currentStoreId = 2; await nextTick(); await p.recover()
    assert.equal(writes, 1); assert.equal(p.pending.value, null)
    assert.ok(p.memory.has('dining-return:1:9'))
    p.kind.value = 'REFUND'; await nextTick(); assert.equal(p.items.value[0].max, 3)
  } finally { p.stop() }
})
