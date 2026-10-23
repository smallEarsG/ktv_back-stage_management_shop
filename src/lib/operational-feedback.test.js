import { canReleaseRecovery } from './recovery-storage.js'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { test } from 'node:test'
import { computed, reactive, ref, watch, effectScope } from 'vue'
import * as helpers from './dining.js'

const script = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8').match(/<script setup>([\s\S]*?)<\/script>/)[1].replace(/^import .*$/gm, '').replaceAll('import.meta.env', 'env')
function requestRuntime() {
  let rejected
  const sandbox = { createTelemetryReporter: () => () => {}, authStorage: { getItem() {} }, axios: { create: () => ({ interceptors: { request: { use() {} }, response: { use(ok, fail) { rejected = fail } } } }) }, env: {}, useUserStore: () => ({ logout() {} }), ElMessage: { error() {} } }
  vm.createContext(sandbox)
  const source = fs.readFileSync(new URL('./request.js', import.meta.url), 'utf8').replace(/^import .*$/gm, '').replaceAll('import.meta.env', 'env').replace('export const reportTelemetry', 'const reportTelemetry').replace('export default service', '')
  vm.runInContext(source, sandbox)
  return rejected
}

test('validation failures release dining intent; authentication, permissions and unknown results retain it', async () => {
  const normalize = requestRuntime()
  for (const status of [400, 401, 403, 409, 422, 500, undefined]) {
    const memory = new Map(), scope = effectScope()
    const error = new Error('库存不足')
    if (status) error.response = { status, data: { message: '库存不足' } }
    let failure
    try { await normalize(error) } catch (e) { failure = e }
    const sandbox = { createRecoveryStorage: raw => raw, canReleaseRecovery, ...helpers, ref, computed, reactive, watch, env: {}, useRoute: () => ({ meta: { diningTab: 'seats' } }), useUserStore: () => ({ currentStoreId: 1, userInfo: { id: 9 }, hasPermission: () => true }),
      localStorage: { getItem: key => memory.get(key), setItem: (key, value) => memory.set(key, value), removeItem: key => memory.delete(key) }, request: { post: async () => { throw failure } },
      ElMessage: { error() {}, warning() {}, success() {} }, ElMessageBox: {}, onMounted() {}, onBeforeUnmount() {}, clearInterval, console }
    vm.createContext(sandbox)
    scope.run(() => vm.runInContext(script('../views/dining/DiningConsole.vue') + '\napi = { retain, recover, pending };', sandbox))
    sandbox.api.retain({ kind: 'order', sessionId: 123, body: { clientOrderNo: 'same-original-key', items: [{ skuId: 1, qty: 99 }] } })
    await sandbox.api.recover()
    const definite = [400, 409, 422].includes(status)
    assert.equal(Boolean(sandbox.api.pending.value), !definite, 'HTTP ' + status)
    assert.equal(memory.has('dining-recovery:1:9'), !definite, 'persisted HTTP ' + status)
    if (!definite) {
      assert.equal(sandbox.api.pending.value.body.clientOrderNo, 'same-original-key')
      assert.equal(JSON.parse(memory.get('dining-recovery:1:9')).body.clientOrderNo, 'same-original-key')
    }
    scope.stop()
  }
})

test('refund history loads when payment capabilities fail, and capability retry can recover', async () => {
  const reads = []
  let mounted, failCapabilities = true
  const sandbox = { ref, computed, reactive, env: {}, useRoute: () => ({ query: {} }), useRouter: () => ({}), useUserStore: () => ({ hasPermission: () => true }), dateRangeParams: () => ({}),
    request: { get: async path => { reads.push(path); if (path === '/payment/capabilities') { if (failCapabilities) throw new Error('渠道能力暂时不可用'); return { wechat: true } }; return { list: [{ id: 12, channel: 'cash', status: 2 }], total: 1 } } },
    onMounted: fn => { mounted = fn }, onBeforeUnmount() {}, ElMessage: {}, ElMessageBox: {}, setInterval: () => 1, clearInterval, console }
  vm.createContext(sandbox)
  vm.runInContext(script('../views/refunds/RefundList.vue') + '\napi = { refunds, wechatEnabled, retryCapabilities: typeof loadCapabilities === "function" ? loadCapabilities : null };', sandbox)
  await mounted().catch(() => {})
  await new Promise(resolve => setImmediate(resolve))
  assert.ok(reads.includes('/refunds'))
  assert.equal(sandbox.api.refunds.value[0].channel, 'cash')
  assert.equal(sandbox.api.wechatEnabled.value, false)
  failCapabilities = false
  assert.equal(typeof sandbox.api.retryCapabilities, 'function')
  await sandbox.api.retryCapabilities()
  assert.equal(sandbox.api.wechatEnabled.value, true)
})
