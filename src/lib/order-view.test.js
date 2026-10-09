import assert from 'node:assert/strict'
import { test } from 'node:test'
import fs from 'node:fs'
import vm from 'node:vm'
import { computed, effectScope, nextTick, reactive, ref, watch } from 'vue'
import dayjs from 'dayjs'
import customParseFormat from 'dayjs/plugin/customParseFormat.js'
import { dateRangeParams } from './date-range.js'

function orderPage(request = {}) {
  const source = fs.readFileSync(new URL('../views/orders/OrderList.vue', import.meta.url), 'utf8')
  const script = source.match(/<script setup>([\s\S]*?)<\/script>/)[1].replace(/^import .*$/gm, '')
  const scope = effectScope()
  const sandbox = { ref, reactive, computed, watch, dayjs, customParseFormat, dateRangeParams,
    onMounted: () => {}, useRoute: () => ({ query: {} }), useUserStore: () => ({ hasPermission: () => true }),
    request, setTimeout, clearTimeout, console: { error: () => {} },
    ElMessage: { error: () => {}, success: () => {}, warning: () => {} }, ElMessageBox: { confirm: async () => {} } }
  vm.createContext(sandbox)
  scope.run(() => vm.runInContext(script + `\napi = { payStatusLabel, payStatusTagType, statusOptions,
    paymentFilters: typeof payStatusOptions === 'undefined' ? [] : payStatusOptions,
    activeStatus, payStatusFilter, currentPage, fetchOrders, handleFilter,
    clearFilterTimer: () => clearTimeout(filterTimer) };`, sandbox))
  return { ...sandbox.api, stop: () => { scope.stop(); sandbox.api.clearFilterTimer() } }
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
