import assert from 'node:assert/strict'
import { test } from 'node:test'
import fs from 'node:fs'
import vm from 'node:vm'
import { computed, effectScope, reactive, ref, watch, nextTick } from 'vue'
import * as helpers from './operations.js'
import * as birthdayHelpers from './birthdays.js'

function view(request, operationTab = 'members') {
  const source = fs.readFileSync(new URL('../views/operations/OperationsCenter.vue', import.meta.url), 'utf8')
  const script = source.match(/<script setup>([\s\S]*?)<\/script>/)[1].replace(/^import .*$/gm, '')
  const scope = effectScope(), cleanup = [], storage = new Map()
  const route = reactive({ meta: { operationTab }, query: {} }), navigations = []
  const sandbox = { ...helpers, ...birthdayHelpers, money: helpers.amountText, ref, reactive, computed, watch, request,
    setInterval: () => 1, clearInterval: () => {}, onMounted: () => {}, onBeforeUnmount: fn => cleanup.push(fn),
    useRoute: () => route, useRouter: () => ({ push: value => navigations.push(value) }), useUserStore: () => ({ currentStoreId: 2, userInfo: { role: 'admin' } }),
    localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) },
    ElMessage: { success: () => {}, error: () => {}, warning: () => {} }, ElMessageBox: { confirm: async () => {} } }
  vm.createContext(sandbox)
  scope.run(() => vm.runInContext(script + '\napi = { open, form, recharge, operationMember, memberOptions, refreshOperationMember, save, memberError, pending, dialogOpen, filterLedger, ledgerFilters, filterMembers, keyword, memberQuery, page, load, birthdayScope, birthdayInvalid, selectBirthdays, rows };', sandbox))
  return { ...sandbox.api, route, navigations, stop: () => { cleanup.forEach(fn => fn()); scope.stop() } }
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

test('会员查询去除首尾空白，未提交的新关键字不会改变翻页和生日范围查询', async () => {
  const reads = [], page = view({ get: async (path, config) => {
    reads.push({ path, ...config.params })
    return { list: [fresh], total: 41 }
  } })
  try {
    page.page.value = 3
    page.keyword.value = '  王会员  '
    await page.filterMembers()
    assert.equal(reads[0].path, '/operations/members')
    assert.equal(reads[0].page, 1)
    assert.equal(reads[0].keyword, '王会员')
    assert.equal(page.memberQuery.value, '王会员')

    page.keyword.value = '尚未查询的手机号'
    page.page.value = 2
    await page.load()
    assert.equal(reads[1].page, 2)
    assert.equal(reads[1].keyword, '王会员')

    await page.selectBirthdays('NEXT7')
    assert.equal(reads[2].path, '/operations/member-birthdays')
    assert.equal(reads[2].page, 1)
    assert.equal(reads[2].keyword, '王会员')
    assert.equal(reads[2].scope, 'NEXT7')
  } finally { page.stop() }
})

test('清空会员搜索立即恢复当前生日范围的首屏，并忽略清空前的慢响应', async () => {
  const reads = [], waiting = [], page = view({ get: (path, config) => {
    reads.push({ path, ...config.params })
    return new Promise(resolve => waiting.push(resolve))
  } })
  try {
    page.birthdayScope.value = 'TODAY'
    page.keyword.value = '王会员'
    const searching = page.filterMembers()
    page.page.value = 2
    page.keyword.value = ''
    const clearing = page.filterMembers()
    assert.equal(reads.length, 2)
    assert.equal(reads[1].path, '/operations/member-birthdays')
    assert.equal(reads[1].keyword, '')
    assert.equal(reads[1].page, 1)
    assert.equal(reads[1].scope, 'TODAY')
    assert.equal(page.memberQuery.value, '')

    waiting[1]({ list: [{ ...fresh, id: 121, name: '今日寿星' }], total: 2 })
    await clearing
    waiting[0]({ list: [fresh], total: 1 })
    await searching
    assert.equal(page.rows.value[0].id, 121)
    assert.equal(page.rows.value[0].name, '今日寿星')
  } finally { page.stop() }
})

test('生日范围由服务端筛选并分页，切换范围忽略先前的慢响应', async () => {
  const pending = [], reads = []
  const page = view({ get: (path, config) => { reads.push({ path, ...config.params }); return new Promise(resolve => pending.push(resolve)) } })
  try {
    page.page.value = 3
    const first = page.selectBirthdays('TODAY'), second = page.selectBirthdays('NEXT7')
    pending[1]({ list: [{ id: 2, birthday: '01-01' }], total: 41 }); await second
    pending[0]({ list: [{ id: 1, birthday: '12-31' }], total: 1 }); await first
    assert.equal(reads[0].path, '/operations/member-birthdays')
    assert.equal(reads[0].page, 1)
    assert.equal(reads[1].scope, 'NEXT7')
    assert.equal(page.rows.value[0].id, 2)
    page.page.value = 2
    const next = page.load(); pending[2]({ list: [], total: 41 }); await next
    assert.equal(reads[2].page, 2)
    assert.equal(reads[2].scope, 'NEXT7')
  } finally { page.stop() }
})

test('会员编辑保存生日或显式清空，不完整月日禁止保存', async () => {
  const writes = [], page = view({ get: async () => ({ list: [], total: 0 }), put: async (path, body) => writes.push({ path, body: JSON.parse(JSON.stringify(body)) }) })
  try {
    await page.open('member', { ...fresh, birthday: '02-29', birthdayVersion: 7 })
    assert.equal(page.form.birthday, '02-29')
    page.birthdayInvalid.value = true
    await page.save(); assert.equal(writes.length, 0)
    page.birthdayInvalid.value = false
    await page.save(); assert.equal(writes[0].body.birthday, '02-29')
    assert.equal(writes[0].body.expectedBirthdayVersion, 7)
    await page.open('member', { ...fresh, birthday: '02-29' })
    page.form.birthday = null
    await page.save(); assert.equal(writes[1].body.birthday, null)
  } finally { page.stop() }
})

test('运营看板的生日筛选跳转到会员名单，不改变原看板请求', () => {
  const page = view({}, 'overview')
  try { page.selectBirthdays('TODAY'); assert.equal(page.navigations[0].path, '/operations/members'); assert.equal(page.navigations[0].query.birthday, 'TODAY') } finally { page.stop() }
})

test('生日筛选失败不会把上一范围名单显示在新筛选下', async () => {
  let fail = false
  const page = view({ get: async () => { if (fail) throw new Error('网络失败'); return { list: [{ id: 1, birthday: '10-15' }], total: 1 } } })
  try {
    await page.selectBirthdays('TODAY'); assert.equal(page.rows.value.length, 1)
    fail = true
    await page.selectBirthdays('MISSING')
    assert.equal(page.birthdayScope.value, 'MISSING')
    assert.equal(page.rows.value.length, 0)
  } finally { page.stop() }
})
