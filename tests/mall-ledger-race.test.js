import { canReleaseRecovery } from '../src/lib/recovery-storage.js'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { test } from 'node:test'
import { computed, reactive, ref } from 'vue'

function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
function memberPage() {
  const requests = []
  let dispose
  const source = fs.readFileSync(new URL('../src/views/mall/MallGrowth.vue', import.meta.url), 'utf8')
  const script = source.match(/<script setup>([\s\S]*?)<\/script>/)[1].replace(/^import .*$/gm, '')
  const sandbox = { createRecoveryStorage: raw => raw, canReleaseRecovery, computed, reactive, ref, request: { get(url) { const task = deferred(); requests.push({ url, ...task }); return task.promise } },
    useRoute: () => ({ meta: { mallGrowth: 'members' }, query: {} }),
    useUserStore: () => ({ product: () => ({ application: { id: 8 } }), hasPermission: () => true, currentStoreId: 1, userInfo: { id: 1 } }),
    localStorage: { getItem: () => null }, onMounted() {}, onBeforeUnmount: callback => { dispose = callback }, console }
  vm.runInNewContext(script + '\n;api = { inspectLedger, ledger, ledgerOpen, error };', sandbox)
  return { ...sandbox.api, requests, dispose: () => dispose(), close() {
    sandbox.api.ledgerOpen.value = false
    const handler = source.match(/<el-drawer\b[^>]*@close="([^"]+)"/)?.[1]
    assert.ok(handler, 'closing the native drawer must invalidate its pending requests and clear its data')
    vm.runInNewContext(handler + '()', sandbox)
  } }
}

test('member ledger keeps the most recently opened customer when an earlier request finishes last', async () => {
  const page = memberPage(), first = page.inspectLedger({ customerId: 11 }), latest = page.inspectLedger({ customerId: 22 })
  assert.match(page.requests[0].url, /\/members\/11\/ledger$/)
  assert.match(page.requests[1].url, /\/members\/22\/ledger$/)
  page.requests[1].resolve({ list: [{ amount: 22 }], total: 1 }); await latest
  page.requests[0].resolve({ list: [{ amount: 11 }], total: 1 }); await first
  assert.equal(page.ledger.value.list[0].amount, 22)
  assert.equal(page.ledgerOpen.value, true)
})
test('closing the member ledger clears displayed data and ignores pending request results', async () => {
  const page = memberPage(), loaded = page.inspectLedger({ customerId: 11 })
  page.requests[0].resolve({ list: [{ amount: 11 }] }); await loaded
  page.close()
  assert.equal(page.ledger.value, null)
  assert.equal(page.ledgerOpen.value, false)
  const pending = page.inspectLedger({ customerId: 22 })
  page.close(); page.requests[1].resolve({ list: [{ amount: 22 }] }); await pending
  assert.equal(page.ledger.value, null)
  assert.equal(page.ledgerOpen.value, false)
})
test('a delayed member ledger error cannot close or replace the latest customer drawer', async () => {
  const page = memberPage(), first = page.inspectLedger({ customerId: 11 }), latest = page.inspectLedger({ customerId: 22 })
  page.requests[1].resolve({ list: [{ amount: 22 }] }); await latest
  page.requests[0].reject(new Error('旧会员流水超时')); await first
  assert.equal(page.ledger.value.list[0].amount, 22)
  assert.equal(page.ledgerOpen.value, true)
  assert.equal(page.error.value, '')
})
test('leaving the member page clears its ledger and ignores pending success or failure', async () => {
  for (const failed of [false, true]) {
    const page = memberPage(), loaded = page.inspectLedger({ customerId: 11 })
    page.requests[0].resolve({ list: [{ amount: 11 }] }); await loaded
    page.dispose()
    assert.equal(page.ledger.value, null)
    assert.equal(page.ledgerOpen.value, false)
    const another = memberPage(), pending = another.inspectLedger({ customerId: 22 })
    another.dispose()
    if (failed) another.requests[0].reject(new Error('离页后的旧错误'))
    else another.requests[0].resolve({ list: [{ amount: 22 }] })
    await pending
    assert.equal(another.ledger.value, null)
    assert.equal(another.ledgerOpen.value, false)
    assert.equal(another.error.value, '')
  }
})
