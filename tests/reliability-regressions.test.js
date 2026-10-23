import { canReleaseRecovery } from '../src/lib/recovery-storage.js'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { test } from 'node:test'
import { computed, reactive, ref } from 'vue'
import { firstProductPath, routeProduct } from '../src/lib/products.js'
import { hasAction, normalizePermissions } from '../src/lib/permissions.js'
import { memberTiersForForm } from '../src/lib/mall2.js'

const products = ['DINING', 'MALL'].map(productType => ({ productType, historyAccessible: true, canTrade: true }))

test('仅业务设置授权的员工进入自己的业务页面，不借用公共或另一业务权限', () => {
  for (const [business, expected] of [['DINING', '/dining/settings'], ['MALL', '/mall/settings']]) {
    const permissions = normalizePermissions([`${business}:settings:view`], ['DINING', 'MALL'])
    const can = (action, type) => hasAction('staff', permissions, type || 'ALL', action)
    const home = firstProductPath(products, can)
    assert.equal(home, expected)
    assert.equal(can('settings:view', routeProduct(home)), true)
    assert.equal(firstProductPath(products.filter(p => p.productType === business), can), expected)
  }
})

test('概览首页仅选择有操作授权的业务，保留双业务老板的全店入口', () => {
  const permissions = normalizePermissions(['MALL:order:view'], ['DINING', 'MALL'])
  assert.equal(firstProductPath(products, (action, business) => hasAction('staff', permissions, business || 'ALL', action)), '/overview?business=MALL')
  assert.equal(firstProductPath(products, () => true), '/overview')
  assert.equal(firstProductPath(products, () => false), '/services')
})

function navigation(error, productFailure = false) {
  let guard
  const messages = [], destinations = []
  const user = { token: 'valid-session', productsReady: true, userInfo: {}, async refresh() { if (error) throw error }, async refreshProducts() { if (productFailure) { this.productsReady = false; this.productsError = '授权查询超时' } }, hasPermission: () => true, canAccessProduct: () => true, logout() { this.token = null } }
  const sandbox = { AppLayout: {}, Login: {}, useUserStore: () => user, routeProduct, insightPermissions: [],
    createWebHistory() {}, createRouter: () => ({ beforeEach: callback => { guard = callback }, onError() {} }),
    ElMessage: { error: message => messages.push(message) }, console }
  const source = fs.readFileSync(new URL('../src/router/index.js', import.meta.url), 'utf8').replace(/^import .*$/gm, '').replace('import.meta.env.BASE_URL', "'/'").replace('export default router', '')
  vm.runInNewContext(source, sandbox)
  return { user, messages, destinations, run: (from = { name: 'Existing', matched: [{}] }) => guard({ path: '/mall/orders', fullPath: '/mall/orders?queue=WAIT_SHIP', meta: { requiresAuth: true, permission: 'order:view' } }, from, value => destinations.push(value)), recover: () => { error = null } }
}

test('刷新账号资料的500或超时保留登录，在当前页面提供重试提示', async () => {
  for (const error of [{ response: { status: 500 } }, { code: 'ECONNABORTED' }]) {
    const page = navigation(error)
    await page.run()
    assert.equal(page.user.token, 'valid-session')
    assert.equal(page.destinations[0], false)
    assert.match(page.messages[0], /重试/)
    page.recover(); await page.run()
    assert.equal(page.destinations.at(-1), undefined)
  }
})

test('首次打开受保护地址遇到网络故障进入恢复页面并保留原目标', async () => {
  const page = navigation({ response: { status: 500 } })
  await page.run({ matched: [] })
  assert.equal(page.user.token, 'valid-session')
  assert.equal(page.destinations[0].path, '/connection')
  assert.equal(page.destinations[0].query.next, '/mall/orders?queue=WAIT_SHIP')
})

test('产品授权查询故障进入恢复流程，不误判为无权限', async () => {
  const page = navigation(null, true)
  await page.run({ matched: [] })
  assert.equal(page.user.token, 'valid-session')
  assert.equal(page.destinations[0].path, '/connection')
  assert.equal(page.destinations[0].query.next, '/mall/orders?queue=WAIT_SHIP')
})

test('确认登录失效仍清除会话并返回登录页', async () => {
  for (const error of [{ code: 401 }, { response: { status: 401 } }]) {
    const page = navigation(error)
    await page.run()
    assert.equal(page.user.token, null)
    assert.equal(page.destinations[0], '/login')
  }
})

test('连接恢复页可重试原地址，拒绝外站和恢复页循环', async () => {
  const source = fs.readFileSync(new URL('../src/views/ConnectionRetry.vue', import.meta.url), 'utf8').match(/<script setup>([\s\S]*?)<\/script>/)[1].replace(/^import .*$/gm, '')
  const route = reactive({ query: { next: '/mall/orders?queue=WAIT_SHIP' } }), attempts = []
  const sandbox = { ref, computed, useRoute: () => route, useRouter: () => ({ replace: async target => attempts.push(target) }) }
  vm.runInNewContext(source + '\n;api = { retryTarget, retry, retrying };', sandbox)
  await sandbox.api.retry()
  assert.deepEqual(attempts, ['/mall/orders?queue=WAIT_SHIP'])
  assert.equal(sandbox.api.retrying.value, false)
  for (const invalid of ['https://example.test', '//example.test', '/connection?next=/orders', '/\\example.test', ['/', '/orders']]) {
    route.query.next = invalid
    assert.equal(sandbox.api.retryTarget.value, '/services')
  }
})

function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
function memberPage() {
  const pending = []
  let configVersion = 0, dispose
  const request = { get: (url, config) => {
    if (url.endsWith('/members/config')) return Promise.resolve({ tiers: [], version: ++configVersion })
    const task = deferred(); pending.push({ ...task, page: config.params.page }); return task.promise
  } }
  const sandbox = { createRecoveryStorage: raw => raw, canReleaseRecovery, computed, ref, reactive, request, memberTiersForForm, useRoute: () => ({ meta: { mallGrowth: 'members' }, query: {} }),
    useUserStore: () => ({ product: () => ({ application: { id: 1 } }), hasPermission: () => true, currentStoreId: 1, userInfo: { id: 1 } }),
    localStorage: { getItem: () => null }, onMounted() {}, onBeforeUnmount: callback => { dispose = callback }, console }
  const script = fs.readFileSync(new URL('../src/views/mall/MallGrowth.vue', import.meta.url), 'utf8').match(/<script setup>([\s\S]*?)<\/script>/)[1].replace(/^import .*$/gm, '')
  vm.runInNewContext(script + '\n;api = { load, page, list, config, loaded, loading, error };', sandbox)
  return { ...sandbox.api, pending, dispose: () => dispose() }
}

test('会员列表快速翻页后迟到旧响应不能覆盖新页或会员规则', async () => {
  const page = memberPage(), first = page.load()
  page.page.value = 2; const second = page.load()
  page.pending[1].resolve({ list: [{ customerId: 22 }], total: 40 }); await second
  page.pending[0].resolve({ list: [{ customerId: 11 }], total: 40 }); await first
  assert.equal(page.page.value, 2)
  assert.equal(page.list.value[0].customerId, 22)
  assert.equal(page.config.version, 2)
})

test('迟到的旧错误不能覆盖新页成功状态', async () => {
  const page = memberPage(), first = page.load()
  page.page.value = 2; const second = page.load()
  page.pending[1].resolve({ list: [{ customerId: 22 }], total: 40 }); await second
  page.pending[0].reject(new Error('old timeout')); await first
  assert.equal(page.loaded.value, true)
  assert.equal(page.error.value, '')
})

test('旧请求结束不能提前关闭新请求加载状态，离页后也不回写列表', async () => {
  const page = memberPage(), first = page.load()
  page.page.value = 2; const second = page.load()
  page.pending[0].resolve({ list: [], total: 40 }); await first
  assert.equal(page.loading.value, true)
  page.dispose(); page.pending[1].resolve({ list: [{ customerId: 22 }], total: 40 }); await second
  assert.equal(page.list.value.length, 0)
})
