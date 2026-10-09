import assert from 'node:assert/strict'
import { test } from 'node:test'
import fs from 'node:fs'
import vm from 'node:vm'
import { reactive, ref, computed } from 'vue'
import dayjs from 'dayjs'
import * as finance from './finance.js'
import { createLatestResource } from './latest-resource.js'
import { financeParams, financeRouteQuery, initialFinanceRange, changeText, paymentLabel } from './finance.js'

test('finance drilldowns preserve inclusive dates and payment method zero', () => {
  const range = initialFinanceRange({ startDate: '2026-10-01', endDate: '2026-10-08' })
  const query = financeRouteQuery(range, { type: 'refund', payMethod: 0, keyword: '' })
  assert.deepEqual(query, { startDate: '2026-10-01', endDate: '2026-10-08', type: 'refund', payMethod: 0 })
  assert.deepEqual(financeParams(initialFinanceRange(query), '自定义'), { period: 'custom', startTime: '2026-10-01 00:00:00', endTime: '2026-10-09 00:00:00' })
  assert.deepEqual(initialFinanceRange({ startDate: 'bad-date', endDate: '2026-10-08' }), [])
  assert.deepEqual(initialFinanceRange({ startDate: '2026-02-31', endDate: '2026-10-08' }), [])
  assert.deepEqual(initialFinanceRange({ startDate: '2026-10-09', endDate: '2026-10-08' }), [])
  assert.equal(paymentLabel(0, 'demo'), '演示退款')
  assert.equal(changeText({ comparable: false, percentage: null }), '暂无可比数据')
})

test('finance resources retain data on refresh failure but clear it for different filters', async () => {
  const state = { data: null, loading: false, error: '', updatedAt: '' }
  let fail = false
  const resource = createLatestResource(state, async () => { if (fail) throw new Error('offline'); return { total: 1 } }, () => '12:00:00')
  assert.equal(await resource.load(), true)
  fail = true
  assert.equal(await resource.load(), false)
  assert.equal(state.data.total, 1)
  assert.match(state.error, /上次成功/)
  assert.equal(await resource.load({ type: 'refund' }, true), false)
  assert.equal(state.data, null)
  assert.equal(state.updatedAt, '')
  assert.match(state.error, /加载失败/)
})

test('old finance pages and failed requests cannot overwrite a newer selection', async () => {
  const pending = []
  const state = { data: null, loading: false, error: '', updatedAt: '' }
  const resource = createLatestResource(state, () => new Promise((resolve, reject) => pending.push({ resolve, reject })))
  const first = resource.load({ page: 1 }, true), second = resource.load({ page: 2 }, true)
  pending[1].resolve({ page: 2 }); await second
  pending[0].reject(new Error('old page failed')); await first
  assert.equal(state.data.page, 2)
  assert.equal(state.error, '')
  assert.equal(state.loading, false)
  const last = resource.load()
  resource.dispose(); pending[2].resolve({ page: 3 }); await last
  assert.equal(state.data.page, 2)
})

test('flow pagination keeps its total during loading and resets only when filters change', async () => {
  const reads = [], pending = []
  const source = fs.readFileSync(new URL('../views/finance/FinanceList.vue', import.meta.url), 'utf8')
  const script = source.match(/<script setup>([\s\S]*?)<\/script>/)[1].replace(/^import .*$/gm, '').replaceAll('import.meta.env.VITE_API_BASE_URL', 'undefined')
  const sandbox = {
    ...finance, ref, computed, dayjs, onMounted: () => {},
    useRoute: () => ({ query: {} }), useRouter: () => ({ push: () => {} }), useUserStore: () => ({}),
    useFinanceResource: () => {
      const state = reactive({ data: null, loading: false, error: '', updatedAt: '' })
      const resource = createLatestResource(state, params => new Promise(resolve => { reads.push({ ...params }); pending.push(resolve) }))
      return Object.assign(state, resource)
    }
  }
  vm.createContext(sandbox)
  vm.runInContext(script + '\napi = { fetchFlows, changePage, applyFilters, changePageSize, total, page, keyword };', sandbox)
  const view = sandbox.api
  const initial = view.fetchFlows()
  pending.shift()({ total: 21, list: [{ flowId: 'income-1' }] }); await initial
  const next = view.changePage(2)
  assert.equal(view.total.value, 21, 'The loading state must not collapse pagination back to page one')
  assert.equal(view.page.value, 2)
  assert.equal(reads.at(-1).page, 2)
  assert.equal(view.changePage(2), undefined, 'Repeated current-page events must not start another request')
  pending.shift()({ total: 21, list: [{ flowId: 'income-21' }] }); await next
  view.keyword.value = 'REF-001'
  const filtered = view.applyFilters()
  assert.equal(view.page.value, 1)
  assert.equal(view.total.value, 0)
  assert.equal(reads.at(-1).keyword, 'REF-001')
  pending.shift()({ total: 1, list: [] }); await filtered
  assert.equal(view.total.value, 1)
  const resized = view.changePageSize(50)
  assert.equal(reads.at(-1).pageSize, 50)
  assert.equal(reads.at(-1).page, 1)
  pending.shift()({ total: 1, list: [] }); await resized
})
