import assert from 'node:assert/strict'
import { test } from 'node:test'
import fs from 'node:fs'
import vm from 'node:vm'
import { computed, effectScope, reactive, ref, watch } from 'vue'
import { inventorySummary, skuInventory } from './inventory.js'

const product = { id: 2, name: '果味饮品', stock: 994, status: true, skus: [
  { id: 2, stockQuantity: 494, skuSpecs: '{"杯型":"中杯"}', lowStockThreshold: 10 },
  { id: 3, stockQuantity: 500, skuSpecs: '{"杯型":"大杯"}', lowStockThreshold: 10 }
] }

function view(path, names, request = {}) {
  const source = fs.readFileSync(new URL(`../views/${path}`, import.meta.url), 'utf8')
  const script = source.match(/<script setup>([\s\S]*?)<\/script>/)[1].replace(/^import .*$/gm, '')
  const scope = effectScope()
  const sandbox = { ref, reactive, computed, watch, inventorySummary, skuInventory, onMounted: () => {}, useRouter: () => ({ push: () => {} }),
    useRoute: () => ({ query: {} }), useUserStore: () => ({ hasPermission: () => true }),
    request, console: { error: () => {} }, ElMessage: { error: () => {}, success: () => {}, warning: () => {} },
    ElMessageBox: { confirm: async () => {} } }
  vm.createContext(sandbox)
  scope.run(() => vm.runInContext(script + `\napi = { ${names.join(',')} };`, sandbox))
  return { ...sandbox.api, stop: () => scope.stop() }
}

test('stocktake follows selected SKU instead of aggregate stock and posts a baseline', async () => {
  const posts = []
  const page = view('warehouse/WarehouseList.vue', ['handleAction', 'form', 'submitAction'], {
    get: async path => path.startsWith('/products/') ? structuredClone(product) : { list: [], total: 0 },
    post: async (path, body) => posts.push({ path, body })
  })
  try {
    await page.handleAction('stocktake', { ...product, current: 994 })
    assert.equal(page.form.quantity, undefined, 'No SKU selected means no proposed count')
    page.form.skuId = 2
    assert.equal(page.form.quantity, 494)
    page.form.quantity = 400
    page.form.skuId = 3
    assert.equal(page.form.quantity, 500, 'Changing SKU resets count to that SKU stock')
    page.form.quantity = 0
    page.form.reason = '实物盘点为0'
    await page.submitAction()
    assert.equal(posts[0].path, '/warehouse/stocktake')
    assert.equal(posts[0].body.quantity, 0)
    assert.equal(posts[0].body.expectedStock, 500)
  } finally { page.stop() }
})

test('stocktake uses freshly fetched SKU stock rather than stale list stock', async () => {
  const fresh = { ...product, skus: [{ ...product.skus[0], stockQuantity: 490 }] }
  const page = view('warehouse/WarehouseList.vue', ['handleAction', 'form'], { get: async () => fresh })
  try {
    await page.handleAction('stocktake', { ...product, current: 994 })
    assert.equal(page.form.skuId, 2)
    assert.equal(page.form.quantity, 490)
  } finally { page.stop() }
})

test('status switching persists only active state and rolls back failed requests', async () => {
  const writes = []
  let fail = false
  const page = view('products/ProductList.vue', ['changeProductStatus'], {
    put: async (path, body) => { writes.push({ path, body }); if (fail) throw new Error('connection lost') }
  })
  try {
    const row = { id: 12, status: false }
    await page.changeProductStatus(row, false)
    assert.equal(writes[0].path, '/products/12')
    assert.deepEqual({ ...writes[0].body }, { active: false })
    fail = true
    row.status = true
    await page.changeProductStatus(row, true)
    assert.equal(row.status, false, 'Server failure restores the last persisted state')
  } finally { page.stop() }
})

test('product pagination reaches page 2 and filters reset to page 1', async () => {
  const reads = []
  const page = view('products/ProductList.vue', ['queryParams', 'total', 'handleProductPageChange', 'onSelectCategory', 'filterProducts'], {
    get: async (path, config) => { reads.push({ path, params: { ...config.params } }); return { list: [], total: 21 } }
  })
  try {
    page.queryParams.page = 2
    await page.handleProductPageChange(2)
    assert.equal(reads.at(-1).params.page, 2)
    assert.equal(page.total.value, 21)
    await page.onSelectCategory('2')
    assert.equal(reads.at(-1).params.page, 1)
    assert.equal(reads.at(-1).params.categoryId, '2')
    page.queryParams.page = 2
    page.queryParams.keyword = '可乐'
    await page.filterProducts()
    assert.equal(reads.at(-1).params.page, 1)
    assert.equal(reads.at(-1).params.keyword, '可乐')
  } finally { page.stop() }
})

test('editing product metadata never sends stale inventory or warehouse thresholds', async () => {
  const writes = []
  const page = view('products/ProductList.vue', ['handleEdit', 'productForm', 'productFormRef', 'saveProduct'], {
    put: async (path, body) => writes.push({ path, body }),
    get: async () => ({ list: [], total: 0 })
  })
  try {
    page.handleEdit({ ...product, categoryId: 1, skus: product.skus.map(sku => ({ ...sku, price: 5 })) })
    page.productFormRef.value = { validate: async () => true }
    page.productForm.name = '新商品名称'
    await page.saveProduct()
    assert.equal(writes.length, 1)
    assert.equal(writes[0].body.name, '新商品名称')
    assert.equal(Object.hasOwn(writes[0].body, 'stock'), false, 'Aggregate stock is read-only')
    assert.equal(Object.hasOwn(writes[0].body, 'lowStockThreshold'), false)
    for (const sku of writes[0].body.skus) {
      assert.equal(Object.hasOwn(sku, 'stock'), false, 'An old product form cannot restore sold stock')
      assert.equal(Object.hasOwn(sku, 'lowStockThreshold'), false, 'Product edits cannot reset warehouse settings')
    }
  } finally { page.stop() }
})

test('warehouse threshold settings accept zero and update only the selected specification', async () => {
  const writes = []
  const page = view('warehouse/WarehouseList.vue', ['handleAction', 'form', 'submitAction', 'canSubmit'], {
    get: async path => path.startsWith('/products/') ? structuredClone(product) : { list: [], total: 0 },
    post: async (path, body) => writes.push({ path, body })
  })
  try {
    await page.handleAction('threshold', product, 3)
    assert.equal(page.form.quantity, 10)
    page.form.quantity = 0
    assert.equal(page.canSubmit.value, true)
    await page.submitAction()
    assert.equal(writes[0].path, '/warehouse/threshold')
    assert.deepEqual({ ...writes[0].body }, { productId: 2, skuId: 3, lowStockThreshold: 0 })
  } finally { page.stop() }
})

test('manual outbound needs a reason and cannot exceed the selected specification stock', async () => {
  const page = view('warehouse/WarehouseList.vue', ['handleAction', 'form', 'canSubmit'], {
    get: async () => structuredClone(product)
  })
  try {
    await page.handleAction('outbound', product, 2)
    assert.equal(page.canSubmit.value, false)
    page.form.reason = '包厢领用'
    assert.equal(page.canSubmit.value, true)
    page.form.quantity = 495
    assert.equal(page.canSubmit.value, false)
  } finally { page.stop() }
})

test('a stocktake conflict keeps the dialog open and refreshes its baseline before retry', async () => {
  const attempts = []
  let stock = 500
  const page = view('warehouse/WarehouseList.vue', ['handleAction', 'form', 'submitAction', 'showDialog'], {
    get: async path => path.startsWith('/products/')
      ? { ...product, skus: [{ ...product.skus[1], stockQuantity: stock }] }
      : { list: [], total: 0 },
    post: async (path, body) => {
      attempts.push({ ...body })
      if (attempts.length === 1) { stock = 490; throw { response: { status: 409 } } }
    }
  })
  try {
    await page.handleAction('stocktake', product)
    page.form.quantity = 480
    page.form.reason = '盘点核对'
    await page.submitAction()
    assert.equal(page.showDialog.value, true)
    assert.equal(page.form.quantity, 490)
    page.form.quantity = 480
    await page.submitAction()
    assert.equal(attempts[0].expectedStock, 500)
    assert.equal(attempts[1].expectedStock, 490)
    assert.equal(page.showDialog.value, false)
  } finally { page.stop() }
})
