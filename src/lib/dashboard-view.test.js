import assert from 'node:assert/strict'
import { test } from 'node:test'
import fs from 'node:fs'
import vm from 'node:vm'
import { computed, effectScope, reactive, ref, watch, nextTick } from 'vue'
import dayjs from 'dayjs'
import { dateRangeParams } from './date-range.js'

function dashboard(request, permissions = true) {
  const source = fs.readFileSync(new URL('../views/dashboard/Dashboard.vue', import.meta.url), 'utf8')
  const script = source.match(/<script setup>([\s\S]*?)<\/script>/)[1].replace(/^import .*$/gm, '')
  const scope = effectScope()
  const navigations = []
  const cleanups = []
  const sandbox = { ref, reactive, computed, watch, nextTick, dayjs, dateRangeParams, request,
    onMounted: () => {}, onBeforeUnmount: fn => cleanups.push(fn),
    useRouter: () => ({ push: to => navigations.push(to) }), useUserStore: () => ({ hasPermission: () => permissions }),
    clearInterval: () => {}, Wallet: 'wallet', RefreshLeft: 'refund', Money: 'money', Tickets: 'tickets', List: 'list', Box: 'box', Bicycle: 'bicycle', Clock: 'clock' }
  vm.createContext(sandbox)
  scope.run(() => vm.runInContext(script + '\napi = { resources, dateRange, summaryCards, tasks, openTask, changeText, fetchAnalytics, fetchSummary, fetchCounters, handleDateRangeChange };', sandbox))
  return { ...sandbox.api, navigations, stop: () => { cleanups.forEach(fn => fn()); scope.stop() } }
}

test('date filters affect business data while tasks request all dates', async () => {
  const reads = []
  const page = dashboard({ get: async (path, config) => { reads.push({ path, params: { ...config.params } }); return {} } })
  try {
    page.dateRange.value = [new Date('2026-10-01T12:00:00'), new Date('2026-10-08T12:00:00')]
    await page.fetchCounters()
    await page.handleDateRangeChange()
    assert.deepEqual(reads.find(read => read.path.endsWith('order-counters')).params, { scope: 'all' })
    for (const read of reads.filter(read => !read.path.endsWith('order-counters'))) {
      assert.equal(read.params.startTime, '2026-10-01 00:00:00')
      assert.equal(read.params.endTime, '2026-10-09 00:00:00')
    }
  } finally { page.stop() }
})

test('a slower previous date request cannot overwrite a newer range', async () => {
  const pending = []
  const page = dashboard({ get: (path, config) => new Promise((resolve, reject) => pending.push({ path, config, resolve, reject })) })
  try {
    page.dateRange.value = [new Date('2026-10-01'), new Date('2026-10-01')]
    const first = page.handleDateRangeChange()
    page.dateRange.value = [new Date('2026-10-02'), new Date('2026-10-02')]
    const second = page.handleDateRangeChange()
    pending.slice(3).forEach(read => read.resolve({ income: { amount: 200 }, xAxis: [], list: [] }))
    await second
    pending[0].resolve({ income: { amount: 100 } })
    pending[1].reject(new Error('old request failed'))
    pending[2].resolve({ list: [{ productName: 'old product' }] })
    await first
    assert.equal(page.resources.summary.data.income.amount, 200)
    assert.equal(page.resources.trend.error, '')
    assert.equal(page.resources.products.data.list.length, 0)
    assert.equal(page.resources.summary.loading, false)
  } finally { page.stop() }
})

test('failed loads show unknown values, retries recover, and failed refreshes preserve known data', async () => {
  let fail = true
  const page = dashboard({ get: async () => { if (fail) throw new Error('offline'); return { income: { amount: 100 }, net: { amount: 90 }, refunds: { amount: 10 }, paidOrderCount: 2 } } })
  try {
    assert.ok(page.summaryCards.value.every(card => card.value === '—'))
    await page.fetchSummary()
    assert.equal(page.resources.summary.data, null)
    assert.match(page.resources.summary.error, /加载失败/)
    fail = false
    await page.fetchSummary()
    assert.equal(page.resources.summary.error, '')
    assert.equal(page.summaryCards.value[2].value, '¥ 90.00')
    fail = true
    await page.fetchSummary()
    assert.equal(page.resources.summary.data.income.amount, 100)
    assert.match(page.resources.summary.error, /上次成功/)
    await page.fetchAnalytics(true)
    assert.equal(page.resources.summary.data, null, 'A different range must not retain old totals')
  } finally { page.stop() }
})

test('task shortcuts carry status and all-time credit filters, respecting permissions', () => {
  const page = dashboard({ get: async () => ({}) })
  const denied = dashboard({ get: async () => ({}) }, false)
  try {
    page.openTask(page.tasks.value.find(task => task.key === 'delivering'))
    page.openTask(page.tasks.value.find(task => task.key === 'unsettled'))
    assert.deepEqual(page.navigations, ['/workbench?status=40', '/orders?status=credit_unsettled&dateScope=all'])
    denied.openTask(denied.tasks.value[0])
    assert.equal(denied.navigations.length, 0)
    assert.equal(page.changeText({ comparable: false, percentage: null }), '暂无可比数据')
    assert.match(page.changeText({ comparable: true, percentage: 12.5, trend: 'down' }), /下降 12.5%/)
  } finally { page.stop(); denied.stop() }
})

test('late responses do not update a dashboard that has been left', async () => {
  let resolve
  const page = dashboard({ get: () => new Promise(done => { resolve = done }) })
  const request = page.fetchCounters()
  page.stop()
  resolve({ toAccept: 8 })
  await request
  assert.equal(page.resources.counters.data, null)
})

test('order shortcut can initialize all-time dates and still switch back to today', () => {
  const source = fs.readFileSync(new URL('../components/TimeRangePicker.vue', import.meta.url), 'utf8')
  const script = source.match(/<script setup>([\s\S]*?)<\/script>/)[1].replace(/^import .*$/gm, '')
  const events = []
  const mounts = []
  const sandbox = { ref, dayjs, defineProps: () => ({ modelValue: [], allowAll: true, defaultShortcut: 'all' }),
    defineEmits: () => (event, value) => events.push([event, value]), onMounted: fn => mounts.push(fn) }
  vm.createContext(sandbox)
  vm.runInContext(script + '\napi = { activeShortcut, dateRange, shortcuts, handleShortcutClick };', sandbox)
  mounts.forEach(fn => fn())
  assert.equal(sandbox.api.activeShortcut.value, 'all')
  assert.equal(events.find(([name]) => name === 'change')[1].length, 0)
  sandbox.api.handleShortcutClick(sandbox.api.shortcuts.find(shortcut => shortcut.value === 'today'))
  assert.equal(sandbox.api.dateRange.value.length, 2)
  assert.deepEqual(events.slice(-2).map(([name]) => name), ['update:label', 'change'])
})
