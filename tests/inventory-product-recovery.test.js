import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { test } from 'node:test'
import { computed, reactive, ref, watch } from 'vue'
import { inventorySummary, skuInventory } from '../src/lib/inventory.js'
import { createRecoveryStorage, canReleaseRecovery } from '../src/lib/recovery-storage.js'

const source = (name, environment) => fs.readFileSync(new URL(`../src/views/${name}`, import.meta.url), 'utf8').match(/<script setup>([\s\S]*?)<\/script>/)[1].replace(/^import .*$/gm, '').replaceAll('import.meta.env.VITE_API_BASE_URL', JSON.stringify(environment?.apiBase || '/api'))
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
const tick = () => new Promise(resolve => setImmediate(resolve))
function storage() { const map = new Map(); return { getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value), removeItem: key => map.delete(key), map } }
function page(name, request, extra = {}) {
  const stops = [], disposers = []
  const context = { computed, reactive, ref, createRecoveryStorage: (raw, actor) => createRecoveryStorage(raw, actor, { VITE_API_BASE_URL: extra.environment?.apiBase || '/api', BASE_URL: '/merchant/', VITE_STORAGE_PREFIX: extra.environment?.prefix || '' }), canReleaseRecovery, watch: (...args) => { const stop = watch(...args); stops.push(stop); return stop }, onMounted() {}, onBeforeUnmount: callback => disposers.push(callback),
    useUserStore: () => ({ hasPermission: () => true, currentStoreId: 5, userInfo: { id: 9 } }), useRoute: () => ({ query: {} }), useRouter: () => ({ push() {} }), request, inventorySummary, skuInventory,
    newRequestKey: () => `inventory-${++page.nextKey}`, localStorage: storage(), ElMessage: { success() {}, warning() {}, error() {} }, ElMessageBox: { confirm: async () => {} }, FormData: class { append() {} }, console: { error() {}, log() {} }, ...extra }
  const exports = name.startsWith('products')
    ? "handleAdd,handleEdit,productForm,productFormRef,saveProduct,handleUploadRequest,showEditDialog,removeSpec,renameSpec:typeof renameSpec==='function'?renameSpec:undefined"
    : "handleAction,form,selectedProduct,dialogType,showDialog,submitting,canSubmit,submitAction,recoverStock:typeof recoverStock==='function'?recoverStock:undefined,pendingStock:typeof pendingStock==='undefined'?ref(null):pendingStock,recoveryError:typeof recoveryError==='undefined'?ref(''):recoveryError"
  const auth = { localStorage: context.localStorage }
  const authSource = fs.readFileSync(new URL('../src/lib/auth-storage.js', import.meta.url), 'utf8').replace('import.meta.env.VITE_STORAGE_PREFIX', JSON.stringify(extra.environment?.prefix || '')).replace('export const authStorage', 'const authStorage')
  vm.runInNewContext(authSource + '\napi=authStorage', auth)
  context.authStorage = auth.api
  vm.runInNewContext(source(name, extra.environment) + `\napi={${exports}}`, context)
  return { ...context.api, storage: context.localStorage, dispose() { disposers.forEach(callback => callback()); stops.forEach(stop => stop()) } }
}
page.nextKey = 0
const product = (id = 1) => ({ id, name: `商品${id}`, categoryId: 9, image: `old-${id}.png`, status: true, specList: [{ name: '容量', values: ['小杯'] }], skus: [{ id: id * 10, specs: { 容量: '小杯' }, price: 8, stock: 13, lowStockThreshold: 0, attrConfig: [{ name: '温度', type: 'single', required: true, options: ['热', '冷'] }] }] })
function fillNew(p) { p.handleAdd(); Object.assign(p.productForm, { name: '测试商品', categoryId: '9' }); p.productForm.skus[0].price = 12.5; p.productFormRef.value = { validate: async () => true } }
function fillStock(p) { p.dialogType.value = 'inbound'; p.form.productId = 7; p.form.skuId = 8; p.form.quantity = 5; p.form.reason = '同一次实物入库'; p.selectedProduct.value = { id: 7, name: '测试库存', skus: [{ id: 8, stockQuantity: 10 }] }; p.showDialog.value = true }

test('新增商品双击保存只提交一次，验证过程也保持提交锁', async () => {
  const response = deferred(), writes = []
  const p = page('products/ProductList.vue', { get: async () => ({ list: [], total: 0 }), post: (path, body) => { writes.push({ path, body }); return response.promise } })
  try { fillNew(p); const a = p.saveProduct(), b = p.saveProduct(); await tick(); assert.equal(writes.length, 1); response.resolve({}); await Promise.all([a, b]) } finally { p.dispose() }
})
test('商品校验失败后释放提交锁，修正后可重新保存', async () => {
  let writes = 0, valid = false
  const p = page('products/ProductList.vue', { get: async () => ({ list: [], total: 0 }), post: async () => { writes++; return {} } })
  try { fillNew(p); p.productFormRef.value.validate = async () => valid; await p.saveProduct(); assert.equal(writes, 0); valid = true; await p.saveProduct(); assert.equal(writes, 1) } finally { p.dispose() }
})
test('新增商品响应丢失后不允许直接重复创建，需先核对列表', async () => {
  let writes = 0
  const p = page('products/ProductList.vue', { post: async () => { writes++; throw new Error('response lost') } })
  try { fillNew(p); await p.saveProduct(); await p.saveProduct(); assert.equal(writes, 1) } finally { p.dispose() }
})
test('旧商品上传的迟到响应不能覆盖新商品编辑器', async () => {
  const response = deferred(), p = page('products/ProductList.vue', { post: () => response.promise })
  try { p.handleEdit(product(1)); const upload = p.handleUploadRequest({ file: { name: 'A.png' } }); p.showEditDialog.value = false; p.handleEdit(product(2)); response.resolve({ url: '/A.png' }); await upload; assert.equal(p.productForm.id, 2); assert.equal(p.productForm.image, 'old-2.png') } finally { p.dispose() }
})
test('关闭后重新编辑同商品也不接收上一轮上传结果', async () => {
  const response = deferred(), p = page('products/ProductList.vue', { post: () => response.promise })
  try { p.handleEdit(product(1)); const upload = p.handleUploadRequest({ file: { name: 'A.png' } }); p.showEditDialog.value = false; p.handleEdit(product(1)); response.resolve({ url: '/old.png' }); await upload; assert.equal(p.productForm.image, 'old-1.png') } finally { p.dispose() }
})
test('当前商品正常上传可以更新图片', async () => {
  const p = page('products/ProductList.vue', { post: async () => ({ url: '/new.png' }) })
  try { p.handleEdit(product(1)); await p.handleUploadRequest({ file: { name: 'new.png' } }); assert.equal(p.productForm.image, '/new.png') } finally { p.dispose() }
})
test('同一编辑器选择新图后，旧图的迟到响应也不能覆盖', async () => {
  const old = deferred(), latest = deferred(); let calls = 0
  const p = page('products/ProductList.vue', { post: () => ++calls === 1 ? old.promise : latest.promise })
  try { p.handleEdit(product()); const a = p.handleUploadRequest({ file: { name: 'old.png' } }), b = p.handleUploadRequest({ file: { name: 'latest.png' } }); latest.resolve({ url: '/latest.png' }); await b; old.resolve({ url: '/old.png' }); await a; assert.equal(p.productForm.image, '/latest.png') } finally { p.dispose() }
})
test('修改规格名称同步所有SKU键并保留编号、价格、库存和口味', () => {
  const p = page('products/ProductList.vue', {})
  try { p.handleEdit(product()); const before = JSON.parse(JSON.stringify(p.productForm.skus[0])); p.renameSpec(0, '杯型'); const sku = p.productForm.skus[0]; assert.equal(p.productForm.specs[0].name, '杯型'); assert.deepEqual(JSON.parse(JSON.stringify(sku.specs)), { 杯型: '小杯' }); for (const key of ['id', 'price', 'stock', 'lowStockThreshold']) assert.equal(sku[key], before[key]); assert.deepEqual(JSON.parse(JSON.stringify(sku.attrConfig)), before.attrConfig) } finally { p.dispose() }
})
test('规格改名冲突不能覆盖另一规格，空规格名不能提交', async () => {
  let writes = 0
  const p = page('products/ProductList.vue', { put: async () => { writes++ } })
  try { p.handleEdit(product()); p.productForm.specs.push({ name: '颜色', values: ['红'] }); p.productForm.skus[0].specs.颜色 = '红'; p.renameSpec(0, '颜色'); assert.equal(p.productForm.specs[0].name, '容量'); assert.equal(p.productForm.skus[0].specs.容量, '小杯'); p.renameSpec(0, ''); p.productFormRef.value = { validate: async () => true }; await p.saveProduct(); assert.equal(writes, 0) } finally { p.dispose() }
})
test('删除最后规格保留原SKU的独立口味属性及零预警', async () => {
  let saved
  const p = page('products/ProductList.vue', { get: async () => ({ list: [] }), put: async (path, body) => { saved = body; return {} } })
  try { const original = product(); p.handleEdit(original); p.removeSpec(0); p.productFormRef.value = { validate: async () => true }; await p.saveProduct(); assert.equal(saved.skus[0].id, 10); assert.equal(p.productForm.skus[0].lowStockThreshold, 0); assert.deepEqual(JSON.parse(saved.skus[0].attrConfigJson), original.skus[0].attrConfig) } finally { p.dispose() }
})
test('入库结果不明跨刷新仍用原请求号恢复，期间阻止新操作', async () => {
  const writes = [], persisted = storage()
  const request = { get: async () => ({ list: [], total: 0 }), post: async (path, body) => { writes.push({ path, body: JSON.parse(JSON.stringify(body)) }); if (writes.length === 1) throw new Error('响应丢失'); return {} } }
  const first = page('warehouse/WarehouseList.vue', request, { localStorage: persisted })
  fillStock(first); await first.submitAction(); assert.ok(first.pendingStock.value?.body.requestKey); const original = JSON.parse(JSON.stringify(first.pendingStock.value)); await first.handleAction('outbound'); assert.equal(first.dialogType.value, 'inbound'); first.form.quantity = 900; first.form.reason = '不影响原请求'; first.dispose()
  const next = page('warehouse/WarehouseList.vue', request, { localStorage: persisted })
  try { assert.equal(next.pendingStock.value.body.requestKey, original.body.requestKey); await next.recoverStock(); assert.equal(writes.length, 2); assert.deepEqual(writes[0], writes[1]); assert.equal(next.pendingStock.value, null); assert.equal(persisted.map.size, 0) } finally { next.dispose() }
})
test('库存恢复记录按门店和员工隔离，损坏记录阻止提交', async () => {
  const persisted = storage(); persisted.setItem('warehouse-recovery:%2Fapi:5:9', '0')
  const original = page('warehouse/WarehouseList.vue', {}, { localStorage: persisted })
  const other = page('warehouse/WarehouseList.vue', {}, { localStorage: persisted, useUserStore: () => ({ hasPermission: () => true, currentStoreId: 5, userInfo: { id: 10 } }) })
  try { assert.ok(original.recoveryError.value); assert.equal(other.pendingStock.value, null); assert.equal(other.recoveryError.value, '') } finally { original.dispose(); other.dispose() }
})
test('同域演示和正式库存恢复互相隔离，不能向另一环境重放原入库', async () => {
  for (const [firstEnv, secondEnv] of [
    [{ prefix: 'demo_', apiBase: '/demo/api' }, { prefix: '', apiBase: '/api' }],
    [{ prefix: '', apiBase: '/staging/api' }, { prefix: '', apiBase: '/api' }],
    [{ prefix: 'preview_', apiBase: '/api' }, { prefix: '', apiBase: '/api' }]
  ]) {
    const persisted = storage(), first = page('warehouse/WarehouseList.vue', { post: async () => { throw new Error('response lost') } }, { localStorage: persisted, environment: firstEnv })
    fillStock(first); await first.submitAction(); assert.ok(first.pendingStock.value); const requestKey = first.pendingStock.value.body.requestKey; first.dispose()
    const same = page('warehouse/WarehouseList.vue', {}, { localStorage: persisted, environment: firstEnv })
    try { assert.equal(same.pendingStock.value?.body.requestKey, requestKey) } finally { same.dispose() }
    let writes = 0
    const second = page('warehouse/WarehouseList.vue', { post: async () => { writes++ } }, { localStorage: persisted, environment: secondEnv })
    try { assert.equal(second.pendingStock.value, null); await second.recoverStock(); assert.equal(writes, 0); assert.equal(persisted.map.size, 1) } finally { second.dispose() }
  }
})
test('不能持久化恢复记录时不发出入库请求', async () => {
  let writes = 0
  const p = page('warehouse/WarehouseList.vue', { post: async () => { writes++ } }, { localStorage: { getItem: () => null, setItem() { throw new Error('storage denied') } } })
  try { fillStock(p); await p.submitAction(); assert.equal(writes, 0); assert.ok(p.recoveryError.value) } finally { p.dispose() }
})
test('入库业务明确拒绝可清除记录，权限失效和网络异常保留原记录', async () => {
  for (const [code, keep] of [[400, false], [409, false], [422, false], [401, true], [403, true], [500, true]]) {
    const p = page('warehouse/WarehouseList.vue', { get: async () => ({ list: [], total: 0 }), post: async () => { throw Object.assign(new Error('rejected'), { code, definitive: code < 500 }) } })
    try { fillStock(p); await p.submitAction(); assert.equal(!!p.pendingStock.value, keep, `code ${code}`) } finally { p.dispose() }
  }
})
test('Axios传输错误优先读取HTTP状态，不让ERR_BAD_REQUEST遮蔽明确拒绝', async () => {
  for (const [status, keep] of [[400, false], [409, false], [422, false], [401, true], [403, true], [500, true], [503, true]]) {
    const failure = Object.assign(new Error('axios transport error'), { code: status < 500 ? 'ERR_BAD_REQUEST' : 'ERR_BAD_RESPONSE', response: { status } })
    const p = page('warehouse/WarehouseList.vue', { get: async () => ({ list: [], total: 0 }), post: async () => { throw failure } })
    try { fillStock(p); await p.submitAction(); assert.equal(!!p.pendingStock.value, keep, `HTTP ${status} with ${failure.code}`); assert.equal(p.storage.map.size, keep ? 1 : 0) } finally { p.dispose() }
  }
})
