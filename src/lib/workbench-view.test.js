import assert from 'node:assert/strict'
import { test } from 'node:test'
import fs from 'node:fs'
import vm from 'node:vm'
import { computed, effectScope, nextTick, reactive, ref, watch } from 'vue'
import dayjs from 'dayjs'
import customParseFormat from 'dayjs/plugin/customParseFormat.js'
import { nextOrderStatus } from './order-flow.js'
import { createPendingMonitor, roomBalancesById } from './cashier-workspace.js'

function workbench(request) {
  const source = fs.readFileSync(new URL('../views/workbench/OrderWorkbench.vue', import.meta.url), 'utf8')
  const script = source.match(/<script setup>([\s\S]*?)<\/script>/)[1].replace(/^import .*$/gm, '')
  const scope = effectScope(), cleanups = []
  const sandbox = { computed, reactive, ref, watch, dayjs, customParseFormat, nextOrderStatus, createPendingMonitor, roomBalancesById,
    request, useRoute: () => ({ query: {} }), useUserStore: () => ({ currentStoreId: 1, userInfo: { id: 3 } }),
    localStorage: { getItem: () => null }, onMounted() {}, onBeforeUnmount: callback => cleanups.push(callback),
    setTimeout, clearTimeout, clearInterval, console }
  vm.createContext(sandbox)
  scope.run(() => vm.runInContext(script + '\napi = { activeTab, workPage, overtimeOnly, roomFilter, keyword, now, fetchOrders, counts, workTotal, filteredOrders, waitMinutes, isOvertime, showNewOrders, loadError };', sandbox))
  return { ...sandbox.api, stop() { cleanups.forEach(callback => callback()); scope.stop() } }
}

test('overtime is filtered by the server before pagination while status counters stay complete', async () => {
  const reads = [], overdueOrder = { id: 88, status: 30, createdAt: dayjs().subtract(25, 'minute').toISOString() }
  const page = workbench({ get: async (path, { params }) => {
    reads.push({ path, params })
    return params.endTime ? { list: [overdueOrder], total: 31, counters: { 30: 31 } } : { list: [], total: 70, counters: { 20: 8, 30: 70, overtime: 40 } }
  } })
  try {
    page.activeTab.value = 30; page.overtimeOnly.value = true; page.roomFilter.value = 'A01'; page.keyword.value = ' ORD '
    await nextTick()
    page.workPage.value = 2
    await nextTick()
    await page.fetchOrders()
    const filtered = reads.filter(read => read.params.endTime).at(-1).params
    assert.equal(filtered.page, 2)
    assert.equal(filtered.status, 30)
    assert.equal(filtered.roomId, 'A01')
    assert.equal(filtered.keyword, 'ORD')
    assert.ok(Math.abs(dayjs().diff(dayjs(filtered.endTime), 'second') - 1200) <= 2)
    assert.equal(page.filteredOrders.value[0].id, 88)
    assert.equal(page.workTotal.value, 31)
    assert.equal(page.counts.value[30], 70)
    assert.equal(page.counts.value.overtime, 40)
    assert.equal(reads.find(read => !read.params.endTime).params.pageSize, 1)
  } finally { page.stop() }
})

test('only unfinished orders waiting at least 20 minutes are marked overdue', () => {
  const page = workbench({})
  try {
    page.now.value = dayjs('2026-10-09T12:00:00').valueOf()
    assert.equal(page.isOvertime({ status: 20, createdAt: '2026-10-09T11:40:00' }), true)
    assert.equal(page.isOvertime({ status: 30, createdAt: '2026-10-09T11:40:01' }), false)
    assert.equal(page.isOvertime({ status: 40, createdAt: '2026-10-09T11:00:00' }), true)
    assert.equal(page.isOvertime({ status: 50, createdAt: '2026-10-09T11:00:00' }), false)
    assert.equal(page.isOvertime({ status: 20, createdAt: 'invalid' }), false)
    assert.equal(page.waitMinutes({ status: 20, createdAt: '2026-10-09T12:01:00' }), 0)
  } finally { page.stop() }
})

test('completed orders and the new-order shortcut remove the overtime filter', async () => {
  const reads = []
  const page = workbench({ get: async (path, { params }) => { reads.push(params); return { list: [], total: 0 } } })
  try {
    page.overtimeOnly.value = true
    page.activeTab.value = 50
    assert.equal(page.overtimeOnly.value, false)
    await nextTick(); await page.fetchOrders()
    assert.equal(reads.at(-1).status, 50)
    assert.equal(reads.at(-1).endTime, undefined)
    page.activeTab.value = 30; page.overtimeOnly.value = true; page.roomFilter.value = 'A01'; page.keyword.value = 'OLD'
    await nextTick()
    page.showNewOrders()
    await nextTick(); await page.fetchOrders()
    assert.equal(page.activeTab.value, 20)
    assert.equal(page.workPage.value, 1)
    assert.equal(page.overtimeOnly.value, false)
    assert.equal(reads.at(-1).roomId, undefined)
    assert.equal(reads.at(-1).keyword, undefined)
    assert.equal(reads.at(-1).endTime, undefined)
  } finally { page.stop() }
})

test('a failed request for an old filter cannot replace the current list or show a stale error', async () => {
  let rejectOld, calls = 0
  const page = workbench({ get: async () => ++calls === 1 ? new Promise((resolve, reject) => { rejectOld = reject }) : { list: [{ id: 9, status: 30 }], total: 1 } })
  try {
    const oldFetch = page.fetchOrders()
    page.activeTab.value = 30
    await nextTick()
    rejectOld(new Error('old request failed'))
    await oldFetch
    assert.equal(page.loadError.value, '')
    await page.fetchOrders()
    assert.equal(page.filteredOrders.value[0].id, 9)
  } finally { page.stop() }
})
