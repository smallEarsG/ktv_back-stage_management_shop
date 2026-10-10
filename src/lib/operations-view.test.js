import assert from 'node:assert/strict'
import { test } from 'node:test'
import fs from 'node:fs'
import vm from 'node:vm'
import { computed, effectScope, reactive, ref, watch, nextTick } from 'vue'
import * as helpers from './operations.js'

function view(request, operationTab = 'members') {
  const source = fs.readFileSync(new URL('../views/operations/OperationsCenter.vue', import.meta.url), 'utf8')
  const script = source.match(/<script setup>([\s\S]*?)<\/script>/)[1].replace(/^import .*$/gm, '')
  const scope = effectScope(), cleanup = [], storage = new Map()
  const sandbox = { ...helpers, money: helpers.amountText, ref, reactive, computed, watch, request,
    setInterval: () => 1, clearInterval: () => {}, onMounted: () => {}, onBeforeUnmount: fn => cleanup.push(fn),
    useRoute: () => ({ meta: { operationTab } }), useUserStore: () => ({ currentStoreId: 2, userInfo: { role: 'admin' } }),
    localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) },
    ElMessage: { success: () => {}, error: () => {}, warning: () => {} }, ElMessageBox: { confirm: async () => {} } }
  vm.createContext(sandbox)
  scope.run(() => vm.runInContext(script + '\napi = { open, form, recharge, operationMember, memberOptions, refreshOperationMember, save, memberError, pending, dialogOpen, filterLedger, ledgerFilters, page, load };', sandbox))
  return { ...sandbox.api, stop: () => { cleanup.forEach(fn => fn()); scope.stop() } }
}

const fresh = { id: 120, name: '王会员', phone: '13800000001', status: 'ACTIVE', principal: 100, bonus: 10 }
function requestForMember(post = async () => {}) {
  return { post, get: async path => path === '/operations/members' ? { list: [], total: 0 }
    : path === '/operations/recharge-plans' ? [{ id: 1, amount: 500, bonus: 50, active: true }]
      : path === '/operations/coupon-templates' ? [] : fresh }
}

test('会员快捷充值预选列表外会员，并根据最新余额与套餐核对到账', async () => {
  const writes = [], page = view(requestForMember(async (path, body) => writes.push({ path, body })))
  try {
    await page.open('recharge', { planId: 1 }, { ...fresh, principal: 1, bonus: 0 })
    await nextTick()
    assert.equal(page.form.memberId, 120)
    assert.equal(page.memberOptions.value[0].id, 120)
    assert.equal(page.recharge.value.balanceAfter, 660)
    page.form.cashReceived = true
    await page.save()
    assert.equal(writes[0].path, '/operations/members/120/recharge')
    assert.equal(writes[0].body.expectedAmount, 500)
    assert.equal(writes[0].body.expectedBonus, 50)
    assert.equal(page.pending.value, null)
  } finally { page.stop() }
})

test('切换充值会员后，较慢的旧余额响应不能覆盖新会员或关闭后的窗口', async () => {
  const waiting = new Map(), page = view({ get: path => new Promise(resolve => waiting.set(path, resolve)) })
  try {
    const first = page.refreshOperationMember(1), second = page.refreshOperationMember(2)
    waiting.get('/operations/members/2')({ ...fresh, id: 2, principal: 200 })
    await second
    waiting.get('/operations/members/1')({ ...fresh, id: 1, principal: 10 })
    await first
    assert.equal(page.operationMember.value.id, 2)
    assert.equal(page.operationMember.value.principal, 200)
    page.dialogOpen.value = true
    await nextTick()
    const third = page.refreshOperationMember(3)
    page.dialogOpen.value = false
    await nextTick()
    waiting.get('/operations/members/3')({ ...fresh, id: 3 })
    await third
    assert.equal(page.operationMember.value, null)
  } finally { page.stop() }
})

test('修改充值金额会清除收款确认，未知充值结果保留原请求', async () => {
  const page = view(requestForMember(async () => { throw new Error('连接中断') }))
  try {
    await page.open('recharge', null, fresh)
    await nextTick()
    page.form.cashReceived = true
    page.form.amount = 500
    await nextTick()
    assert.equal(page.form.cashReceived, false)
    page.form.cashReceived = true
    await page.save()
    assert.equal(page.pending.value.body.expectedAmount, 500)
    assert.equal(page.dialogOpen.value, true)
  } finally { page.stop() }
})

test('钱包筛选在查询后应用并重置分页，翻页保留已查询条件', async () => {
  const reads = [], page = view({ get: async (path, config) => { if (path === '/operations/wallet-ledger') reads.push({ ...config.params }); return path === '/operations/wallet-ledger' ? { list: [], total: 40 } : [] } }, 'wallet')
  try {
    page.page.value = 2
    Object.assign(page.ledgerFilters, { keyword: '王会员', type: 'RECHARGE', dates: ['2026-10-09', '2026-10-10'] })
    await page.filterLedger()
    assert.equal(reads[0].page, 1)
    assert.equal(reads[0].startDate, '2026-10-09')
    assert.equal(reads[0].endDate, '2026-10-10')
    page.ledgerFilters.keyword = '未提交条件'
    page.page.value = 2
    await page.load()
    assert.equal(reads[1].page, 2)
    assert.equal(reads[1].keyword, '王会员')
  } finally { page.stop() }
})
