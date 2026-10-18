import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { test } from 'node:test'
import { computed, reactive, ref } from 'vue'
import * as mall from '../src/lib/mall.js'
import * as growth from '../src/lib/mall2.js'

function growthPage(tab, allowed = [], pending = null) {
  const calls = [], storage = new Map(), grants = new Set(allowed)
  if (pending) storage.set('mall-growth:1:7:9', JSON.stringify(pending))
  const user = { currentStoreId: 1, userInfo: { id: 9 }, product: () => ({ application: { id: 7 } }), hasPermission: (action, business = 'MALL') => business === 'MALL' && grants.has(action) }
  const sandbox = { ...mall, ...growth, computed, reactive, ref, useRoute: () => ({ meta: { mallGrowth: tab }, query: {} }), useUserStore: () => user,
    request: { get: async () => ({}), put: async (...args) => calls.push(args), post: async (...args) => { calls.push(args); return { list: [] } } },
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    newRequestKey: () => 'new-intent', onMounted() {}, onBeforeUnmount() {}, ElMessage: { success() {} }, ElMessageBox: { confirm: async () => {} }, console }
  vm.createContext(sandbox)
  const script = fs.readFileSync(new URL('../src/views/mall/MallGrowth.vue', import.meta.url), 'utf8').match(/<script setup>([\s\S]*?)<\/script>/)[1].replace(/^import .*$/gm, '')
  vm.runInContext(script + '\napi = { recover, open, send, save, loaded, pending, error, editor };', sandbox)
  return { ...sandbox.api, calls, grants, storage }
}

test('批量原请求恢复要求发货权限，仅订单查询不能重发', async () => {
  const original = { path: '/batch-ship', method: 'post', body: { requestKey: 'original-batch', rows: [{ orderId: 10, expectedVersion: 3 }] } }
  const page = growthPage('batch', ['order:view'], original)
  await page.recover()
  assert.equal(page.calls.length, 0)
  assert.equal(page.pending.value.body.requestKey, 'original-batch')
  assert.match(page.error.value, /无权/)
  page.grants.add('order:ship')
  await page.recover()
  assert.equal(page.calls.length, 1)
  assert.equal(page.calls[0][1].requestKey, 'original-batch')
  assert.equal(page.pending.value, null)
})

test('会员查询和财务查看不能编辑规则、发券、充值或导出', async () => {
  const page = growthPage('batch', ['operations:view', 'finance:view'])
  page.loaded.value = true
  for (const type of ['coupon', 'topup', 'bind', 'integration']) page.open(type)
  assert.equal(page.editor.value, '')
  await page.save('members', { tiers: [] })
  for (const path of ['/birthday-run', '/order-export', '/members/1/mock-topup', '/import-confirm', '/batch-ship']) await page.send(path)
  assert.equal(page.calls.length, 0)
  assert.equal(page.pending.value, null)
})

test('共享配置、复制和绑定授权分别检查，不能借一个动作执行其他动作', async () => {
  const page = growthPage('batch', ['sharing:copy'])
  await page.send('/sharing/inventory', { mallSkuId: 1, diningSkuId: 2 })
  page.loaded.value = true
  await page.save('sharing', {})
  assert.equal(page.calls.length, 0)
  await page.send('/sharing/copy-product', { productId: 1 })
  assert.equal(page.calls.length, 1)
  assert.match(page.calls[0][0], /sharing\/copy-product$/)
})
