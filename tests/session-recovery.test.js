import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { test } from 'node:test'
import { ref } from 'vue'
import * as products from '../src/lib/products.js'
import { businessAllowed } from '../src/lib/business.js'
import { hasAction, isV2Permissions } from '../src/lib/permissions.js'

function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
function sessionStore(delayedLogins = false) {
  const storage = new Map([['token', 'token-A'], ['currentStoreId', '1'], ['userInfo', JSON.stringify({ id: 1, permissions: ['A'] })]])
  const reads = [], logins = []
  const sandbox = { ...products, ref, businessAllowed, hasAction, isV2Permissions,
    defineStore: (_, factory) => factory,
    useRouter: () => ({ currentRoute: ref({ path: '/overview' }), replace() {} }),
    authStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    request: {
      get(url) { if (url === '/auth/products') return Promise.resolve({ products: [] }); const task = deferred(); reads.push(task); return task.promise },
      post(_, body) { if (!delayedLogins) return Promise.resolve({ token: 'token-B', userInfo: { id: 2, storeId: 2, permissions: ['B'] } }); const task = deferred(); logins.push({ ...task, body }); return task.promise }
    }, console: { error() {} } }
  const source = fs.readFileSync(new URL('../src/stores/user.js', import.meta.url), 'utf8').replace(/^import .*$/gm, '').replace('export const useUserStore', 'const useUserStore')
  vm.runInNewContext(source + '\n;api = useUserStore();', sandbox)
  return { ...sandbox.api, reads, logins, storage }
}

test('旧账号资料成功或失败响应都不能覆盖切换后的新会话', async () => {
  for (const rejected of [false, true]) {
    const store = sessionStore(), old = store.refresh(true)
    store.logout(); await store.login({ phone: 'B', password: 'test-only' })
    if (rejected) store.reads[0].reject({ code: 401 })
    else store.reads[0].resolve({ id: 1, permissions: ['A'] })
    await old
    assert.equal(store.token.value, 'token-B')
    assert.equal(store.userInfo.value.id, 2)
    assert.deepEqual([...store.permissions.value], ['B'])
    assert.equal(store.currentStoreId.value, '2')
    assert.equal(JSON.parse(store.storage.get('userInfo')).id, 2)
  }
})

test('账号资料并发刷新只接纳最新一次结果', async () => {
  const store = sessionStore(), old = store.refresh(true), latest = store.refresh(true)
  store.reads[1].resolve({ id: 1, permissions: ['latest'] }); await latest
  store.reads[0].resolve({ id: 1, permissions: ['obsolete'] }); await old
  assert.deepEqual([...store.permissions.value], ['latest'])
})

test('迟到的旧登录不能覆盖后发的新登录', async () => {
  const store = sessionStore(true), old = store.login({ phone: 'A', password: 'test-only' }), latest = store.login({ phone: 'B', password: 'test-only' })
  store.logins[1].resolve({ token: 'token-B', userInfo: { id: 2, storeId: 2, permissions: ['B'] } }); assert.equal(await latest, true)
  store.logins[0].resolve({ token: 'token-A', userInfo: { id: 1, storeId: 1, permissions: ['A'] } }); assert.equal(await old, false)
  assert.equal(store.token.value, 'token-B')
  assert.equal(store.userInfo.value.id, 2)
})

function requestClient(token) {
  let success, failure
  const user = { token, currentStoreId: '2', logout() { this.token = null } }
  const service = { interceptors: { request: { use() {} }, response: { use: (yes, no) => { success = yes; failure = no } } } }
  const sandbox = { axios: { create: () => service }, useUserStore: () => user, authStorage: { getItem() {} }, createTelemetryReporter: () => () => {}, ElMessage: { error() {} } }
  const source = fs.readFileSync(new URL('../src/lib/request.js', import.meta.url), 'utf8').replace(/^import .*$/gm, '').replaceAll('import.meta.env.VITE_API_BASE_URL', "'/api'").replace('export const reportTelemetry', 'const reportTelemetry').replace('export default service', '')
  vm.runInNewContext(source, sandbox)
  return { user, success, failure }
}

test('旧会话401不能退出新会话，当前会话401仍正常退出', async () => {
  for (const kind of ['body', 'http']) for (const token of ['token-A', 'token-B']) {
    const client = requestClient('token-B'), config = { headers: { Authorization: `Bearer ${token}` }, silent: true }
    if (kind === 'body') await assert.rejects(client.success({ data: { code: 401, message: 'expired' }, status: 200, config }))
    else await assert.rejects(client.failure({ response: { status: 401 }, config }))
    assert.equal(client.user.token, token === 'token-B' ? null : 'token-B')
  }
})
