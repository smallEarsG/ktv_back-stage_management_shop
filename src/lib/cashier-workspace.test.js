import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import dayjs from 'dayjs'
import customParseFormat from 'dayjs/plugin/customParseFormat.js'
import { computed, effectScope, reactive, ref, watch } from 'vue'
import * as workspace from './cashier-workspace.js'
import { cashierReceipt, recoveryKey } from './cashier-result.js'
import { nextOrderStatus } from './order-flow.js'

const storage = () => {
  const values = new Map()
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }
}
const roomA = { id: 1, roomNumber: 'A', isAvailable: true }, roomB = { id: 2, roomNumber: 'B', isAvailable: true }
const line = { productName: '饮料', skuId: 1, price: 12, qty: 1, selectedAttrs: {} }

function view(path, names, request, saved = storage()) {
  const source = fs.readFileSync(new URL(`../views/${path}`, import.meta.url), 'utf8')
  const script = source.match(/<script setup>([\s\S]*?)<\/script>/)[1].replace(/^import .*$/gm, '')
  const scope = effectScope(), mounts = [], cleanups = []
  const sandbox = {
    ...workspace, computed, reactive, ref, watch, dayjs, customParseFormat, cashierReceipt, recoveryKey, nextOrderStatus,
    localStorage: saved, sessionStorage: storage(), request,
    useUserStore: () => ({ currentStoreId: '1', userInfo: { id: 3 }, hasPermission: () => true }),
    useRoute: () => ({ query: {} }), onMounted: callback => mounts.push(callback), onBeforeUnmount: callback => cleanups.push(callback),
    ElMessage: { success() {}, error() {}, warning() {} }, ElMessageBox: { confirm: async () => {} },
    setInterval: () => 1, clearInterval() {}, setTimeout, clearTimeout, console
  }
  vm.createContext(sandbox)
  scope.run(() => vm.runInContext(script + `\napi = { ${names.join(',')} };`, sandbox))
  return { ...sandbox.api, mount: async () => { for (const callback of mounts) await callback(); await new Promise(resolve => setImmediate(resolve)) }, stop: () => { cleanups.forEach(callback => callback()); scope.stop() } }
}

const get = async path => path === '/rooms' ? { list: [roomA, roomB] }
  : path === '/orders/operations-summary' ? { roomBalances: [], pendingOrderIds: [] }
    : { list: [], total: 0 }

test('room drafts survive switching and a fresh page instance', async () => {
  const saved = storage(), names = ['loadRooms', 'chooseRoom', 'addCartLine', 'cartItems', 'selectedRoom']
  const first = view('pos/PosIndex.vue', names, { get }, saved)
  await first.loadRooms(); first.addCartLine(line); first.chooseRoom(roomB); first.addCartLine({ ...line, qty: 2 })
  first.chooseRoom(roomA); assert.equal(first.cartItems.value[0].qty, 1)
  first.chooseRoom(roomB); assert.equal(first.cartItems.value[0].qty, 2); first.stop()
  const reload = view('pos/PosIndex.vue', names, { get }, saved)
  try { await reload.loadRooms(); reload.chooseRoom(roomB); assert.equal(reload.cartItems.value[0].qty, 2); reload.chooseRoom(roomA); assert.equal(reload.cartItems.value[0].qty, 1) }
  finally { reload.stop() }
})

test('lost response is persisted, locks cart and retries the original body after reload', async () => {
  const saved = storage(), writes = []
  const names = ['loadRooms', 'addCartLine', 'cartItems', 'createCashierOrder', 'pendingSubmission', 'recoverSubmission', 'incQty']
  const request = { get: async path => path === '/orders/by-client-no' ? null : get(path), post: async (path, body) => { writes.push(JSON.parse(JSON.stringify(body))); throw new Error('connection lost') } }
  const first = view('pos/PosIndex.vue', names, request, saved)
  await first.loadRooms(); first.addCartLine(line); await first.createCashierOrder(3)
  const originalId = first.pendingSubmission.value.clientOrderNo
  first.incQty(first.cartItems.value[0]); assert.equal(first.cartItems.value[0].qty, 1); first.stop()
  const reload = view('pos/PosIndex.vue', names, request, saved)
  try {
    await reload.loadRooms(); await reload.recoverSubmission(true)
    assert.equal(writes[1].clientOrderNo, originalId); assert.deepEqual(writes[1], writes[0])
    request.get = async path => path === '/orders/by-client-no' ? { orderId: 9, orderNo: 'ORIGINAL', amountTotal: 12, status: 20, payMethod: 3, payStatus: 0 } : get(path)
    await reload.recoverSubmission(true)
    assert.equal(writes.length, 2, 'Existing order is recovered without another creation request')
    assert.equal(reload.pendingSubmission.value, null); assert.equal(reload.cartItems.value.length, 0)
  } finally { reload.stop() }
})

test('cash opening quotes first, and requires enough tender plus receipt confirmation', async () => {
  const writes = []
  const page = view('pos/PosIndex.vue', ['loadRooms', 'addCartLine', 'createCashierOrder', 'confirmCashOrder', 'cashReceived', 'cashConfirmed', 'lastCashChange'], {
    get, post: async (path, body) => { writes.push({ path, body }); return path === '/cashier/quote' ? { amountTotal: 12 } : { orderId: 8, orderNo: 'CASH', amountTotal: 12, status: 50, payStatus: 2, payMethod: 2 } }
  })
  try {
    await page.loadRooms(); page.addCartLine(line); await page.createCashierOrder(2)
    assert.equal(writes.length, 1); assert.equal(writes[0].path, '/cashier/quote')
    page.cashConfirmed.value = true; page.cashReceived.value = 10; await page.confirmCashOrder(); assert.equal(writes.length, 1)
    page.cashReceived.value = 20; page.cashConfirmed.value = false; await page.confirmCashOrder(); assert.equal(writes.length, 1)
    page.cashConfirmed.value = true; await page.confirmCashOrder()
    assert.equal(writes[1].body.expectedAmount, 12); assert.equal(writes[1].body.cashReceived, 20); assert.equal(page.lastCashChange.value, 8)
  } finally { page.stop() }
})

test('a confirmed inventory rejection releases the pending lock while keeping the cart', async () => {
  const page = view('pos/PosIndex.vue', ['loadRooms', 'addCartLine', 'createCashierOrder', 'cartItems', 'pendingSubmission'], {
    get, post: async () => { const error = new Error('库存不足'); error.response = { status: 409 }; throw error }
  })
  try {
    await page.loadRooms(); page.addCartLine(line); await page.createCashierOrder(3)
    assert.equal(page.pendingSubmission.value, null); assert.equal(page.cartItems.value[0].qty, 1)
  } finally { page.stop() }
})

test('a late creation response after leaving the page cannot overwrite newer saved drafts', async () => {
  const saved = storage()
  let respond
  const page = view('pos/PosIndex.vue', ['loadRooms', 'addCartLine', 'createCashierOrder'], {
    get, post: () => new Promise(resolve => { respond = resolve })
  }, saved)
  await page.loadRooms(); page.addCartLine(line)
  const inFlight = page.createCashierOrder(3)
  page.stop()
  workspace.writeCashierWorkspace(saved, workspace.cashierWorkspaceKey(1, 3), { A: [{ ...line, qty: 2 }] }, null)
  respond({ orderId: 9, orderNo: 'LATE', amountTotal: 12, payMethod: 3, payStatus: 0, status: 20 })
  await inFlight
  assert.equal(workspace.readCashierWorkspace(saved, workspace.cashierWorkspaceKey(1, 3)).drafts.A[0].qty, 2)
})

test('payment capability failure does not block independent room, category or product loading', async () => {
  const reads = []
  const page = view('pos/PosIndex.vue', ['rooms', 'capabilityError', 'wechatEnabled'], {
    get: async path => { reads.push(path); if (path === '/payment/capabilities') throw new Error('offline'); return get(path) }
  })
  try {
    await page.mount(); assert.equal(page.rooms.value.length, 2); assert.equal(page.wechatEnabled.value, false); assert.ok(page.capabilityError.value)
    for (const path of ['/rooms', '/categories', '/products']) assert.ok(reads.includes(path))
  } finally { page.stop() }
})

test('new order detection and room balances work while a different tab and page are open', async () => {
  let snapshot = { pendingOrderIds: [1], roomBalances: [{ roomId: 'A', unsettledCount: 6, unsettledAmount: 72 }] }
  const page = view('workbench/OrderWorkbench.vue', ['activeTab', 'workPage', 'orders', 'refreshSummary', 'newOrderCount', 'roomUnsettledCounts'], {
    get: async () => snapshot
  })
  try {
    page.activeTab.value = 30; page.workPage.value = 2; page.orders.value = [{ id: 50, roomName: 'A', status: 30, payStatus: 0 }]
    await page.refreshSummary(); assert.equal(page.newOrderCount.value, 0); assert.equal(page.roomUnsettledCounts.value.A, 6)
    snapshot = { ...snapshot, pendingOrderIds: [1, 29, 30] }
    await page.refreshSummary(); assert.equal(page.newOrderCount.value, 2)
    await page.refreshSummary(); assert.equal(page.newOrderCount.value, 2, 'Repeated snapshots do not repeat alerts')
  } finally { page.stop() }
})

test('an older balance poll cannot replace the refreshed balance after collection', async () => {
  let finishOld, calls = 0
  const page = view('pos/PosIndex.vue', ['loadBalances', 'roomBalances'], {
    get: async () => ++calls === 1 ? new Promise(resolve => { finishOld = resolve })
      : { roomBalances: [{ roomId: 'A', unsettledCount: 0, unsettledAmount: 0 }] }
  })
  try {
    const oldPoll = page.loadBalances(); await page.loadBalances()
    finishOld({ roomBalances: [{ roomId: 'A', unsettledCount: 3, unsettledAmount: 36 }] })
    await oldPoll; assert.equal(page.roomBalances.value.A.unsettledCount, 0)
  } finally { page.stop() }
})

test('money arithmetic is in cents and draft storage is isolated per user and store', () => {
  assert.equal(workspace.cashChange(0.1, 0.3), 0.2)
  assert.equal(workspace.cashChange(12, 10), null)
  assert.equal(workspace.cashChange(12, '20.001'), null)
  assert.notEqual(workspace.cashierWorkspaceKey(1, 3), workspace.cashierWorkspaceKey(2, 3))
  assert.notEqual(workspace.cashierWorkspaceKey(1, 3), workspace.cashierWorkspaceKey(1, 4))
})
