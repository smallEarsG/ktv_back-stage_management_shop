import assert from 'node:assert/strict'
import { test } from 'node:test'
import fs from 'node:fs'
import vm from 'node:vm'
import { setImmediate as flushPromises } from 'node:timers/promises'
import { computed, effectScope, nextTick, reactive, ref, watch } from 'vue'
import dayjs from 'dayjs'
import customParseFormat from 'dayjs/plugin/customParseFormat.js'
import { dateRangeParams } from './date-range.js'

function orderPage(request = {}, query = {}) {
  const source = fs.readFileSync(new URL('../views/orders/OrderList.vue', import.meta.url), 'utf8')
  const script = source.match(/<script setup>([\s\S]*?)<\/script>/)[1].replace(/^import .*$/gm, '')
  const scope = effectScope()
  const route = reactive({ query })
  const sandbox = { ref, reactive, computed, watch, dayjs, customParseFormat, dateRangeParams,
    onMounted: () => {}, onBeforeUnmount: () => {}, useRoute: () => route, useRouter: () => ({ push: async () => {} }), useUserStore: () => ({ hasPermission: () => true }),
    request, setTimeout, clearTimeout, console: { error: () => {} },
    ElMessage: { error: () => {}, success: () => {}, warning: () => {} }, ElMessageBox: { confirm: async () => {} } }
  vm.createContext(sandbox)
  scope.run(() => vm.runInContext(script + `\napi = { payStatusLabel, payStatusTagType, statusOptions,
    paymentFilters: typeof payStatusOptions === 'undefined' ? [] : payStatusOptions,
    activeStatus, payStatusFilter, currentPage, fetchOrders, handleFilter,
    showDetailDialog, detailLoading, orderDetail, openOrderDetail,
    clearFilterTimer: () => clearTimeout(filterTimer) };`, sandbox))
  return { ...sandbox.api, route, stop: () => { scope.stop(); sandbox.api.clearFilterTimer() } }
}

test('cancelled orders display cancellation rather than an unknown payment state', () => {
  const page = orderPage()
  try {
    for (const payStatus of [3, '3', 0, 1, null, undefined]) {
      assert.equal(page.payStatusLabel({ status: 90, payStatus }), '已取消')
    }
    assert.equal(page.payStatusLabel({ status: '90', pay_status: '3' }), '已取消')
    assert.equal(page.payStatusTagType({ status: 90, payStatus: 3 }), 'info')
    assert.equal(page.payStatusLabel({ status: 90, payStatus: 2 }), '已支付', 'Never hide an explicit paid state')
  } finally { page.stop() }
})

test('failed payments are distinguished from cancelled orders and normal payment states', () => {
  const page = orderPage()
  try {
    assert.equal(page.payStatusLabel({ status: 10, payStatus: 3 }), '支付失败')
    assert.equal(page.payStatusTagType({ status: 10, payStatus: 3 }), 'danger')
    assert.equal(page.payStatusLabel({ status: 10, payStatus: 0 }), '未支付')
    assert.equal(page.payStatusLabel({ status: 10, payStatus: 1 }), '支付中')
    assert.equal(page.payStatusLabel({ status: 92, payStatus: 2 }), '已支付')
    assert.equal(page.payStatusLabel({ status: 93, payStatus: 2 }), '已支付')
    assert.equal(page.payStatusLabel({ status: 50 }), '已支付', 'Legacy orders retain their fallback')
    assert.equal(page.payStatusLabel({ status: 10, payStatus: -1 }), '已取消')
    assert.equal(page.payStatusLabel(null), '—')
  } finally { page.stop() }
})

test('refund status filters use supported server values and restart pagination', async () => {
  const reads = []
  const page = orderPage({ get: async (path, config) => { reads.push({ path, params: { ...config.params } }); return { list: [], total: 0 } } })
  try {
    for (const [value, label] of [['92', '部分退款'], ['93', '已退款']]) {
      assert.equal(page.statusOptions.find(option => option.value === value)?.label, label)
      page.currentPage.value = 3
      page.activeStatus.value = value
      page.handleFilter()
      await nextTick()
      assert.equal(reads.at(-1).path, '/orders')
      assert.equal(reads.at(-1).params.status, value)
      assert.equal(reads.at(-1).params.page, 1)
    }
  } finally { page.stop() }
})

test('paying filter sends payment status 1 and resets pagination', async () => {
  const reads = []
  const page = orderPage({ get: async (path, config) => { reads.push({ ...config.params }); return { list: [], total: 0 } } })
  try {
    assert.equal(page.paymentFilters.find(option => option.value === '1')?.label, '支付中')
    page.currentPage.value = 3
    page.payStatusFilter.value = '1'
    page.handleFilter()
    await nextTick()
    assert.equal(reads.at(-1).payStatus, '1')
    assert.equal(reads.at(-1).page, 1)
  } finally { page.stop() }
})

test('linked order opens detail directly even when outside the current list or date range', async () => {
  const reads = []
  const detail = { orderId: 71, orderNo: 'OLDER-ORDER', amountTotal: 24, items: [{ name: '可乐', qty: 2 }] }
  const page = orderPage({ get: async path => { reads.push(path); return detail } }, { orderId: '71', dateScope: 'all', from: 'refunds' })
  try {
    await nextTick()
    await flushPromises()
    assert.deepEqual(reads, ['/orders/71'])
    assert.equal(page.showDetailDialog.value, true)
    assert.equal(page.detailLoading.value, false)
    assert.equal(page.orderDetail.value.orderNo, 'OLDER-ORDER')
    assert.equal(page.orderDetail.value.items[0].qty, 2)
  } finally { page.stop() }
})

test('switching linked orders never shows a slower response for the previous order', async () => {
  const pending = new Map()
  const page = orderPage({ get: path => new Promise(resolve => pending.set(path, resolve)) }, { orderId: '71' })
  try {
    page.route.query.orderId = '72'
    await nextTick()
    pending.get('/orders/72')({ orderId: 72, orderNo: 'CURRENT' })
    await nextTick()
    pending.get('/orders/71')({ orderId: 71, orderNo: 'STALE' })
    await nextTick()
    assert.equal(page.orderDetail.value.orderNo, 'CURRENT')
    assert.equal(page.detailLoading.value, false)
  } finally { page.stop() }
})

test('unavailable linked order closes detail without showing previous order data', async () => {
  const page = orderPage({ get: async () => { throw new Error('订单不存在') } }, { orderId: '999' })
  try {
    await nextTick()
    await flushPromises()
    assert.equal(page.showDetailDialog.value, false)
    assert.equal(page.orderDetail.value, null)
    assert.equal(page.detailLoading.value, false)
  } finally { page.stop() }
})

test('invalid linked order IDs do not produce detail requests', async () => {
  for (const id of ['', '0', '-1', 'not-an-id', '1/returns']) {
    const reads = []
    const page = orderPage({ get: async path => reads.push(path) }, { orderId: id })
    try {
      await nextTick()
      assert.deepEqual(reads, [])
      assert.equal(page.showDetailDialog.value, false)
    } finally { page.stop() }
  }
})
