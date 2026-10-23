import { canReleaseRecovery } from '../src/lib/recovery-storage.js'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { test } from 'node:test'
import { computed, reactive, ref, watch } from 'vue'
import { createPinia, defineStore, setActivePinia } from 'pinia'
import * as products from '../src/lib/products.js'
import * as business from '../src/lib/business.js'
import * as permissions from '../src/lib/permissions.js'
import * as mall from '../src/lib/mall.js'
import { skuFields, skuPayload } from '../src/lib/mall-product-editor.js'
import { canReleaseMallIntent } from '../src/lib/mall2.js'

const file = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const plain = source => source.replace(/^import .*$/gm, '').replace(/import\.meta\.env\.\w+/g, 'undefined')
const script = path => plain(file(path).match(/<script setup>([\s\S]*?)<\/script>/)[1])
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }

function mandatoryPasswordSession() {
  setActivePinia(createPinia())
  const storage = new Map(), calls = [], decisions = []
  const account = { id: 9, role: 'staff', storeId: 88, permissions: [], passwordChangeRequired: true }
  const request = {
    post: async path => { calls.push(path); return { token: 'test-session', userInfo: account } },
    get: async path => { calls.push(path); if (path === '/auth/user') return account; if (account.passwordChangeRequired) throw { response: { status: 428 } }; return { products: [{ productType: 'DINING', historyAccessible: true }] } }
  }
  let guard
  const router = { currentRoute: ref({ path: '/login' }), replace() {}, beforeEach: callback => { guard = callback }, onError() {} }
  const context = { defineStore, ref, useRouter: () => router, request, ...products, ...business, ...permissions,
    authStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) } }
  vm.runInNewContext(plain(file('src/stores/user.js')).replace('export const useUserStore', 'const useUserStore') + '\ngetStore=useUserStore', context)
  const user = context.getStore()
  vm.runInNewContext(plain(file('src/router/index.js')).replace('export default router', ''), { AppLayout: {}, Login: {}, useUserStore: () => user, ...products, ...business,
    createWebHistory() {}, createRouter: () => router, ElMessage: { error() {} } })
  return { user, calls, account, storage,
    navigate: async (path, from = { matched: [] }) => { decisions.length = 0; await guard({ path, fullPath: path, meta: { requiresAuth: true } }, from, value => decisions.push(value)); return decisions[0] } }
}

test('初始密码账号登录与直接刷新改密页均无需调用被服务器禁止的产品接口', async () => {
  const page = mandatoryPasswordSession()
  assert.equal(await page.user.login({ phone: 'test-account', password: 'test-only' }), true)
  assert.equal(page.calls.includes('/auth/products'), false)
  assert.equal(page.user.homePath(), '/account/security')
  assert.equal(await page.navigate('/account/security'), undefined)
  assert.equal(page.user.token, 'test-session')
  assert.equal(page.calls.includes('/auth/products'), false)
  assert.equal(page.user.productsReady, false)
})

test('改密前的业务页跳到安全页，改密后重新登录必须重新核对产品', async () => {
  const page = mandatoryPasswordSession()
  await page.user.login({ phone: 'test-account', password: 'test-only' })
  assert.equal(await page.navigate('/mall/orders'), '/account/security')
  assert.equal(page.calls.includes('/auth/products'), false)
  page.user.logout(); page.account.passwordChangeRequired = false
  assert.equal(await page.user.login({ phone: 'test-account', password: 'new-test-only' }), true)
  assert.equal(page.calls.filter(path => path === '/auth/products').length, 1)
  assert.equal(page.user.productsReady, true)
})

test('过期登录不能借改密页绕过账号刷新与失效处理', async () => {
  let guard, loggedOut = false
  const user = { token: 'expired', userInfo: { passwordChangeRequired: true }, async refresh() { throw { response: { status: 401 } } }, async refreshProducts() { assert.fail('must not query products') }, logout() { loggedOut = true; this.token = null } }
  vm.runInNewContext(plain(file('src/router/index.js')).replace('export default router', ''), { AppLayout: {}, Login: {}, useUserStore: () => user, ...products, ...business, createWebHistory() {},
    createRouter: () => ({ beforeEach: callback => { guard = callback }, onError() {} }), ElMessage: { error() {} } })
  let destination
  await guard({ path: '/account/security', meta: { requiresAuth: true } }, { matched: [] }, value => { destination = value })
  assert.equal(loggedOut, true); assert.equal(destination, '/login')
})

test('403返回首页使用当前账号授权首页，包含改密优先入口', () => {
  for (const home of ['/dining/settings', '/mall/settings', '/account/security', '/services']) {
    const targets = []
    const context = { useRouter: () => ({ push: target => targets.push(target), back() {} }), useUserStore: () => ({ homePath: () => home }) }
    vm.runInNewContext(script('src/views/403.vue') + '\napi={goHome}', context)
    context.api.goHome(); assert.equal(targets[0], home)
  }
})

function settingsPage() {
  const reads = [], writes = [], disposers = [], stops = []
  const user = { userInfo: { role: 'admin', id: 9 }, permissions: [], canAccessProduct: () => true, hasPermission: () => true }
  const context = { computed, reactive, ref, watch: (...args) => { const stop = watch(...args); stops.push(stop); return stop }, useUserStore: () => user,
    isV2Permissions: permissions.isV2Permissions, authStorage: { getItem: () => JSON.stringify(user.userInfo) }, onMounted() {}, onBeforeUnmount: callback => disposers.push(callback),
    ElMessage: { success() {}, warning() {} }, ElMessageBox: { confirm: async () => {} }, console: { error() {} },
    request: { get: path => { if (path === '/rooms') return Promise.resolve({ list: [] }); const task = deferred(); reads.push({ ...task, path }); return task.promise },
      put: async (path, body) => { writes.push({ path, body }); return {} }, post: async (path, body) => { writes.push({ path, body }); return {} } } }
  vm.runInNewContext(script('src/views/settings/SettingsIndex.vue') + '\napi={handleEditRoom,handleAddRoom,roomDialogVisible,roomForm,roomFormRef,submitRoom,roomDetailLoading,roomError}', context)
  context.api.roomFormRef.value = { validate: async callback => callback ? callback(true) : true, clearValidate() {} }
  return { ...context.api, reads, writes, dispose() { disposers.forEach(fn => fn()); stops.forEach(fn => fn()) } }
}
const room = id => ({ id, roomNumber: `R${id}`, type: '餐桌', capacity: 2, isAvailable: true })

test('房间快速切换编辑只接纳最新详情，保存到当前目标', async () => {
  const page = settingsPage()
  try {
    const first = page.handleEditRoom(room(1)), latest = page.handleEditRoom(room(2))
    page.reads[1].resolve(room(2)); await latest
    page.reads[0].resolve(room(1)); await first
    assert.equal(page.roomForm.id, 2)
    page.roomForm.roomNumber = 'R2-renamed'; await page.submitRoom()
    assert.equal(page.writes[0].path, '/rooms/2')
  } finally { page.dispose() }
})

test('关闭后新建房间时旧详情响应不能把新增改成编辑', async () => {
  const page = settingsPage()
  try {
    const old = page.handleEditRoom(room(1))
    page.roomDialogVisible.value = false; page.handleAddRoom()
    page.reads[0].resolve(room(1)); await old
    assert.equal(page.roomForm.id, null)
    page.roomForm.roomNumber = 'New'; page.roomForm.type = '餐桌'; await page.submitRoom()
    assert.equal(page.writes[0].path, '/rooms')
  } finally { page.dispose() }
})

test('旧房间请求失败和结束不能覆盖新房间错误与加载状态', async () => {
  const page = settingsPage()
  try {
    const old = page.handleEditRoom(room(1)), latest = page.handleEditRoom(room(2))
    page.reads[0].reject(new Error('obsolete timeout')); await old
    assert.equal(page.roomDetailLoading.value, true)
    assert.equal(page.roomError.value, '')
    page.reads[1].resolve(room(2)); await latest
    assert.equal(page.roomDetailLoading.value, false)
    assert.equal(page.roomForm.id, 2)
  } finally { page.dispose() }
})

test('房间详情尚未载入或载入失败时禁止误提交为新增', async () => {
  const page = settingsPage()
  try {
    const pending = page.handleEditRoom(room(1))
    page.roomForm.roomNumber = 'manual'; await page.submitRoom()
    assert.equal(page.writes.length, 0)
    page.reads[0].reject(new Error('timeout')); await pending
    await page.submitRoom(); assert.equal(page.writes.length, 0)
  } finally { page.dispose() }
})

test('关闭或离页后房间请求不回写，校验期间换目标也不能提交旧房间', async () => {
  const page = settingsPage()
  const first = page.handleEditRoom(room(1)); page.roomDialogVisible.value = false
  page.reads[0].resolve(room(1)); await first
  assert.notEqual(page.roomForm.roomNumber, 'R1')
  const loaded = page.handleEditRoom(room(2)); page.reads[1].resolve(room(2)); await loaded
  const validation = deferred(); page.roomFormRef.value.validate = () => validation.promise
  const saving = page.submitRoom(); page.roomDialogVisible.value = false; page.handleAddRoom()
  validation.resolve(true); await saving; assert.equal(page.writes.length, 0)
  const gone = page.handleEditRoom(room(3)); page.dispose()
  page.reads[2].resolve(room(3)); await gone
  assert.notEqual(page.roomForm.roomNumber, 'R3')
})

function catalogEditor(grants) {
  const writes = []
  const user = { currentStoreId: 88, userInfo: { id: 9 }, permissions: grants, product: () => ({ application: { id: 7 } }), canTradeProduct: () => true,
    hasPermission: (action, scope = 'MALL', legacy) => permissions.hasAction('staff', grants, scope, legacy && !permissions.isV2Permissions(grants) ? legacy : action) }
  const context = { createRecoveryStorage: raw => raw, canReleaseRecovery, ...mall, skuFields, skuPayload, canReleaseMallIntent, isV2Permissions: permissions.isV2Permissions, computed, reactive, ref, useUserStore: () => user,
    useRoute: () => ({ meta: { mallTab: 'products' }, query: {} }), newRequestKey: () => 'test-request', onMounted() {}, onBeforeUnmount() {},
    localStorage: { getItem: () => null }, ElMessage: { warning() {}, success() {} }, console,
    request: { get: async () => ({ list: [] }), post: async (path, body) => { writes.push({ path, body }); return { id: 1 } }, put: async (path, body) => { writes.push({ path, body }); return { id: body.id || 1 } } } }
  vm.runInNewContext(script('src/views/mall/MallConsole.vue') + '\napi={open,form,editor,submit,canSubmitEditor,manageCategories,categories}', context)
  return { ...context.api, writes }
}

test('商城细分权限新增分类需创建权限，编辑权限只可编辑已有分类', async () => {
  const create = catalogEditor(permissions.normalizePermissions(['MALL:product:create'], ['MALL']))
  create.open('category'); create.form.name = 'New'; assert.equal(create.canSubmitEditor(), true)
  await create.submit(); assert.equal(create.writes[0].path, '/mall/apps/7/categories')
  create.open('category', { id: 2, name: 'Existing' }); assert.equal(create.editor.value, '')
  const edit = catalogEditor(permissions.normalizePermissions(['MALL:product:edit'], ['MALL']))
  edit.open('category'); assert.equal(edit.editor.value, '')
  edit.open('category', { id: 2, name: 'Existing' }); assert.equal(edit.canSubmitEditor(), true)
  await edit.submit(); assert.equal(edit.writes[0].path, '/mall/apps/7/categories/2')
  edit.open('product'); assert.equal(edit.editor.value, '')
})

test('商城旧版商品编辑授权保留分类新增兼容', async () => {
  const page = catalogEditor(['product:view'])
  page.open('category'); page.form.name = 'Legacy'; assert.equal(page.canSubmitEditor(), true)
  await page.submit(); assert.equal(page.writes[0].path, '/mall/apps/7/categories')
})

test('商城仅编辑授权管理分类时直接打开已有分类，不展示无效新增入口', () => {
  const page = catalogEditor(permissions.normalizePermissions(['MALL:product:edit'], ['MALL']))
  page.manageCategories(); assert.equal(page.editor.value, '')
  page.categories.value = [{ id: 4, name: 'Existing', active: true }]
  page.manageCategories(); assert.equal(page.editor.value, 'category'); assert.equal(page.form.id, 4)
  assert.equal(page.canSubmitEditor(), true)
})
