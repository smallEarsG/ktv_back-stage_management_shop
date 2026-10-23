import fs from 'node:fs'
import vm from 'node:vm'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as vue from 'vue'
import dayjs from 'dayjs'
import * as operations from './operations.js'
import * as birthdays from './birthdays.js'
import * as dining from './dining.js'
import * as mall from './mall.js'
import * as mall2 from './mall2.js'
import * as editor from './mall-product-editor.js'
import * as workspace from './cashier-workspace.js'
import * as result from './cashier-result.js'
import { createRecoveryStorage, canReleaseRecovery } from './recovery-storage.js'

const kinds = {
  operations: ['views/operations/OperationsCenter.vue', 'submitFinancial,recover,pending,recoveryError'],
  dining: ['views/dining/DiningConsole.vue', 'retain,recover,pending,openOrder,orderVisible,currentSession,orders,selectedOrders,tender,cashConfirmed,collectCash'],
  room: ['components/RoomBillingSettlement.vue', 'settle,recover,pending,cash,confirmed'],
  mall: ['views/mall/MallConsole.vue', 'perform,operation,recover,pending,recoveryError'],
  growth: ['views/mall/MallGrowth.vue', 'send,recover,pending'],
  pos: ['views/pos/PosIndex.vue', 'pendingSubmission,postSubmission,recoverSubmission,persistWorkspace'],
  return: ['components/DiningReturnRequest.vue', 'pending,reason,submit,recover']
}
const tick = () => new Promise(resolve => setImmediate(resolve))
const clone = value => JSON.parse(JSON.stringify(value))
const storage = () => {
  const values = new Map()
  return { values, getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }
}
const environment = name => ({ VITE_API_BASE_URL: name === 'demo' ? '/demo/api' : '/api', BASE_URL: name === 'demo' ? '/demo/merchant/' : '/merchant/', VITE_STORAGE_PREFIX: name === 'demo' ? 'demo_' : '' })
const legacyKeys = {operations:'ktv-operations-pending:1',dining:'dining-recovery:1:9',room:'room-billing:1:9',mall:'mall-pending:1:7:9',growth:'mall-growth:1:7:9',pos:'cashier-workspace:v1:1:9',return:'dining-return:1:9'}
let sequence = 0
function page(kind, memory, env = 'demo', response = 'lost', actor = 9) {
  const writes = [], scope = vue.effectScope(), cleanup = [], nativeStorage = storage()
  const props = vue.reactive({ sessionId: 12, order: { id: 34, items: [{ id: 7, name: '饮品', returnableQty: 1, refundableQty: 1 }] } })
  const user = vue.reactive({ currentStoreId: 1, userInfo: { id: actor, role: 'admin' }, product: () => ({ application: { id: 7 } }), canTradeProduct: () => true, hasPermission: () => true })
  const request = {
    get: async url => url === '/orders/by-client-no' ? null : url.endsWith('/room-bill') ? { sessionId: 12, revision: 4, amountDue: '72.00', settled: false } : url.startsWith('/dining') ? [] : { list: [], total: 0 },
    post: async (url, body) => {
      writes.push({ url, body: clone(body) })
      if (response === 'lost') throw new Error('response lost')
      if (response === 'denied') throw Object.assign(new Error('permission denied'), { definitive: true, code: 403, response: { status: 403 } })
      return { id: 8, orderId: body.orderId, requestKey: body.requestKey, kind: body.kind, sessionId: 12, settled: true, change: 8 }
    }
  }
  const context = { ...vue, ...operations, ...birthdays, ...dining, ...mall, ...mall2, ...editor, ...workspace, ...result, dayjs,
    request, localStorage: memory, sessionStorage: nativeStorage, createRecoveryStorage: (raw, id) => createRecoveryStorage(raw, id, environment(env)), canReleaseRecovery,
    useUserStore: () => user, useRoute: () => ({ meta: { operationTab: 'members', diningTab: 'seats', mallTab: 'products', mallGrowth: 'batch' }, query: {} }), useRouter: () => ({ push() {} }),
    onMounted() {}, onBeforeUnmount: fn => cleanup.push(fn), defineProps: () => props, defineEmits: () => () => {},
    setInterval: () => 1, clearInterval() {}, crypto: { randomUUID: () => `uuid-${++sequence}` }, console: { error() {} }, ElMessage: { success() {}, error() {}, warning() {} }, ElMessageBox: { confirm: async () => {} }
  }
  context.money = kind === 'operations' ? operations.amountText : dining.money
  const [file, expose] = kinds[kind]
  const source = fs.readFileSync(new URL('../'+file, import.meta.url), 'utf8').match(/<script setup>([\s\S]*?)<\/script>/)[1].replace(/^import .*$/gm,'').replaceAll('import.meta.env', 'env')
  context.env = environment(env)
  scope.run(() => vm.runInNewContext(source + `\napi={${expose}}`, context))
  return { ...context.api, writes, stop() { cleanup.forEach(fn=>fn()); scope.stop() } }
}
const pending = (kind,p) => kind === 'pos' ? p.pendingSubmission.value : p.pending.value
async function start(kind,p) {
  if (kind === 'operations') { try { await p.submitFinancial('/operations/members/120/recharge', { requestKey:'original', amount:100, bonus:0, expectedAmount:100, expectedBonus:0, cashReceived:true }) } catch { /* Unknown result remains pending. */ } }
  if (kind === 'dining') { p.retain({ kind:'settle', sessionId:12, body:{ requestKey:'original', orderIds:[34], expectedAmount:'72.00', cashReceived:'80.00' } }); await p.recover() }
  if (kind === 'room') { await tick(); p.cash.value=80; await vue.nextTick(); p.confirmed.value=true; await p.settle() }
  if (kind === 'mall') await p.perform(p.operation('/skus/8/stock',{ expectedVersion:0, delta:5, reason:'one receipt' },'库存调整',8))
  if (kind === 'growth') await p.send('/coupons',{ name:'test', amount:5, minimum:20 })
  if (kind === 'pos') { p.pendingSubmission.value={ storeId:1, roomId:'101', clientOrderNo:'original', payMethod:2, expectedAmount:8, cashReceived:8, items:[{skuId:8,qty:1}] }; p.persistWorkspace(); await p.postSubmission(p.pendingSubmission.value) }
  if (kind === 'return') { p.reason.value='未制作退菜'; await p.submit() }
}
async function recover(kind,p) {
  if(kind==='pos') await p.recoverSubmission(true)
  else if(kind==='operations') { try { await p.recover() } catch { /* Business result is inspected below. */ } }
  else await p.recover()
}
for (const kind of Object.keys(kinds)) {
  test(`${kind}: legacy records retain evidence and cannot replay into this environment`,async()=>{
    const raw=storage(), first=page(kind,raw)
    await start(kind,first);const saved=[...raw.values.values()][0];first.stop();raw.values.clear();raw.setItem(legacyKeys[kind],saved)
    const current=page(kind,raw,'production')
    try { await tick();await recover(kind,current);assert.equal(current.writes.length,0);assert.equal(raw.getItem(legacyKeys[kind]),saved) } finally {current.stop()}
  })
  test(`${kind}: another deployment or employee cannot retry the original write`, async () => {
    const raw=storage(), original=page(kind,raw)
    try { await start(kind,original); assert.ok(pending(kind,original)); const saved=[...raw.values.entries()]
      for(const [env,actor] of [['production',9],['demo',10]]) {
        const other=page(kind,raw,env,'lost',actor)
        try { await tick(); assert.equal(pending(kind,other),null); await recover(kind,other); assert.equal(other.writes.length,0) } finally { other.stop() }
      }
      assert.deepEqual([...raw.values.entries()],saved)
    } finally { original.stop() }
  })
  test(`${kind}: same deployment reload retains the exact original request`,async()=>{
    const raw=storage(), first=page(kind,raw)
    await start(kind,first); const original=clone(pending(kind,first)); first.stop()
    const second=page(kind,raw)
    try { await tick(); assert.deepEqual(clone(pending(kind,second)),original); await recover(kind,second); assert.equal(second.writes.length,1); assert.ok(pending(kind,second)); const expected=kind==='pos'?original:original.body||original; assert.deepEqual(second.writes[0].body,expected) } finally { second.stop() }
  })
}
for(const kind of ['operations','dining','room','pos','return']) {
  test(`${kind}: 403 after an uncertain result retains the original request`,async()=>{
    const raw=storage(), first=page(kind,raw)
    await start(kind,first); const original=clone(pending(kind,first)); first.stop()
    const denied=page(kind,raw,'demo','denied')
    try { await tick(); await recover(kind,denied); assert.deepEqual(clone(pending(kind,denied)),original); assert.ok(raw.values.size) } finally { denied.stop() }
  })
}
test('damaged dining recovery blocks new goods and cash writes without overwriting evidence',async()=>{
  const raw=storage(), scoped=createRecoveryStorage(raw,9,environment('demo'))
  scoped.setItem('dining-recovery:1:9','broken-json')
  const p=page('dining',raw)
  try { await p.openOrder(); assert.equal(p.orderVisible.value,false); p.currentSession.value={id:12}; p.orders.value=[{id:34,amountTotal:72,payMethod:3,payStatus:0,status:20}];p.selectedOrders.value=[34];p.tender.value=80;await vue.nextTick();p.cashConfirmed.value=true;await p.collectCash();await p.recover();assert.equal(p.writes.length,0);assert.equal(scoped.getItem('dining-recovery:1:9'),'broken-json') } finally { p.stop() }
})
