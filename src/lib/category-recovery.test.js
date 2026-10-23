import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { test } from 'node:test'
import * as vue from 'vue'
import { createRecoveryStorage, canReleaseRecovery } from './recovery-storage.js'

const source = fs.readFileSync(new URL('../views/products/ProductList.vue', import.meta.url), 'utf8').match(/<script setup>([\s\S]*?)<\/script>/)[1].replace(/^import .*$/gm, '').replaceAll('import.meta.env.VITE_API_BASE_URL', "'/api'")
const memory = () => { const values = new Map(); return { values, getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) } }
const environment = { VITE_API_BASE_URL: '/demo/api', BASE_URL: '/demo/merchant/', VITE_STORAGE_PREFIX: 'demo_' }
const tick = () => new Promise(resolve => setImmediate(resolve))
function page(raw = memory(), options = {}) {
  const posts = [], reads = [], disposers = [], scope = vue.effectScope()
  const actor = options.actor || 7
  const context = { ...vue, localStorage: raw, createRecoveryStorage: (storage, user) => createRecoveryStorage(storage, user, options.env || environment), canReleaseRecovery,
    useUserStore: () => ({ userInfo: { id: actor }, currentStoreId: 1, hasPermission: () => true }), useRouter: () => ({ push() {} }),
    onMounted() {}, onBeforeUnmount: callback => disposers.push(callback), newRequestKey: () => 'fixture-local-intent',
    request: { get: async (url, config) => { reads.push(url); return options.get ? options.get(url, config) : { list: [] } }, post: async (url, body) => { posts.push({ url, body: JSON.parse(JSON.stringify(body)) }); if (options.post) return options.post(url, body); throw new Error('response lost after insert') } },
    inventorySummary() {}, console: { error() {}, log() {} }, ElMessage: { warning() {}, error() {}, success() {} }, ElMessageBox: { confirm: async () => {} }
  }
  scope.run(() => vm.runInNewContext(source + '\napi={handleAddCategory,handleOpenAddCategory,addCategoryForm,showCategoryDialog,categorySaveUncertain,categorySaveError,reconcile:typeof reconcileCategory===\'function\'?reconcileCategory:null}', context))
  return { ...context.api, posts, reads, raw, stop() { disposers.forEach(fn => fn()); scope.stop() } }
}
const fill = p => Object.assign(p.addCategoryForm, { name: '原分类', sort: 4, active: false })

test('unknown category creation survives double clicks, reopening and page remount without another POST', async () => {
  const raw = memory(), first = page(raw)
  fill(first); const one = first.handleAddCategory(), two = first.handleAddCategory(); await Promise.all([one, two])
  assert.equal(first.posts.length, 1)
  first.showCategoryDialog.value = false; first.handleOpenAddCategory(); await first.handleAddCategory()
  assert.equal(first.posts.length, 1, 'reopening must not clear the unknown result')
  assert.equal(first.addCategoryForm.name, '原分类'); first.stop()
  const resumed = page(raw); resumed.handleOpenAddCategory(); await resumed.handleAddCategory()
  assert.equal(resumed.posts.length, 0); assert.equal(resumed.categorySaveUncertain.value, true)
  assert.equal(resumed.addCategoryForm.name, '原分类'); assert.equal(resumed.addCategoryForm.sort, 4); assert.equal(resumed.addCategoryForm.active, false)
  resumed.stop()
})

test('401 and 403 retain the persisted category while explicit validation rejection releases it', async () => {
  for (const code of [401, 403, 400, 409, 422]) {
    const raw = memory(), p = page(raw, { post: async () => { throw Object.assign(new Error('rejected'), { definitive: true, code, response: { status: code } }) } })
    fill(p); await p.handleAddCategory()
    assert.equal(raw.values.size > 0, [401, 403].includes(code), String(code))
    assert.equal(p.categorySaveUncertain.value, [401, 403].includes(code)); p.stop()
  }
})

test('explicit category reconciliation is read-only and unlocks only after a complete list contains the original name', async () => {
  const raw = memory(), first = page(raw); fill(first); await first.handleAddCategory(); first.stop()
  let result = new Error('list unavailable')
  const p = page(raw, { get: async () => { if (result instanceof Error) throw result; return result } })
  p.handleOpenAddCategory(); assert.equal(typeof p.reconcile, 'function')
  for (const value of [new Error('list unavailable'), { list: [] }, { list: [{ id: 8, name: '原分类' }], total: 2 }, { unrelated: true }]) {
    result = value; await p.reconcile()
    assert.equal(raw.values.size, 1); assert.equal(p.categorySaveUncertain.value, true); assert.equal(p.posts.length, 0)
  }
  result = { list: [{ id: 8, name: '原分类', sort: 4 }] }; await p.reconcile()
  assert.equal(raw.values.size, 0); assert.equal(p.categorySaveUncertain.value, false); assert.equal(p.posts.length, 0)
  fill(p); await p.handleAddCategory()
  assert.equal(p.posts.length, 0, 'an existing same-name category must be edited instead of created again')
  assert.match(p.categorySaveError.value, /已存在|编辑/); p.stop()
})

test('normal category create persists before POST and clears on success without blocking another distinct category', async () => {
  const raw = memory(), p = page(raw, { post: async () => { assert.equal(raw.values.size, 1); return { id: 8 } } })
  fill(p); await p.handleAddCategory(); await tick()
  assert.equal(p.posts.length, 1); assert.equal(raw.values.size, 0); assert.equal(p.categorySaveUncertain.value, false)
  p.handleOpenAddCategory(); p.addCategoryForm.name = '另一个分类'; await p.handleAddCategory(); assert.equal(p.posts.length, 2); p.stop()
})

test('damaged persisted category evidence remains untouched and blocks another create', async () => {
  const raw = memory(), p = page(raw); fill(p); await p.handleAddCategory(); p.stop()
  const key = [...raw.values.keys()][0]; assert.ok(key)
  for (const damaged of ['broken-json', '', 'false', '0', '""', '{}', '[]']) {
    raw.values.set(key, damaged)
    const resumed = page(raw); resumed.handleOpenAddCategory(); fill(resumed); await resumed.handleAddCategory()
    assert.equal(resumed.posts.length, 0); assert.equal(raw.values.get(key), damaged); assert.equal(resumed.categorySaveUncertain.value, true)
    assert.match(resumed.categorySaveError.value, /损坏|无法读取|核对/); resumed.stop()
  }
})

test('pending category scope does not lock or replay into another employee or deployment', async () => {
  const raw = memory(), p = page(raw); fill(p); await p.handleAddCategory(); p.stop()
  for (const options of [{ actor: 8 }, { env: { VITE_API_BASE_URL: '/api', BASE_URL: '/merchant/' } }]) {
    const other = page(raw, options); other.handleOpenAddCategory()
    assert.equal(other.categorySaveUncertain.value, false); assert.equal(other.posts.length, 0); other.stop()
  }
  assert.equal(raw.values.size, 1)
})
