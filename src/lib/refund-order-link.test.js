import assert from 'node:assert/strict'
import { test } from 'node:test'
import fs from 'node:fs'
import vm from 'node:vm'
import { computed, reactive, ref } from 'vue'

function refundPage(allowed = true, permissions = ['order:view']) {
  const source = fs.readFileSync(new URL('../views/refunds/RefundList.vue', import.meta.url), 'utf8')
  const script = source.match(/<script setup>([\s\S]*?)<\/script>/)[1].replace(/^import .*$/gm, '').replaceAll('import.meta.env.VITE_DEMO_MODE', "'true'")
  const navigation = [], warnings = []
  const requests = []
  const sandbox = { computed, ref, reactive, useRoute: () => ({ query: {} }),
    useRouter: () => ({ push: target => navigation.push(JSON.parse(JSON.stringify(target))) }),
    useUserStore: () => ({ hasPermission: permission => allowed && permissions.includes(permission) }),
    request: { post: (...args) => { requests.push(args); return Promise.resolve() } },
    onMounted: () => {}, onBeforeUnmount: () => {}, ElMessage: { warning: message => warnings.push(message) } }
  vm.createContext(sandbox)
  vm.runInContext(script + '\napi = { openRelatedOrder, submit, audit, retryWechat, canApprove };', sandbox)
  return { ...sandbox.api, navigation, warnings, requests }
}

test('refund link uses the related order ID and opens the existing order detail view', () => {
  const page = refundPage()
  page.openRelatedOrder({ id: 999, orderId: 71, orderNumber: 'OLDER-ORDER' })
  assert.deepEqual(page.navigation, [{ name: 'Orders', query: { orderId: '71', dateScope: 'all', from: 'refunds' } }])
  assert.deepEqual(page.warnings, [])
})

test('view-only refunds page blocks direct approval, creation and retry handlers', async () => {
  const page = refundPage(true, ['refund:view'])
  assert.equal(page.canApprove.value, false)
  await page.submit()
  await page.audit({ id: 1, channel: 'wallet' }, 'approve')
  await page.retryWechat({ id: 1, channel: 'wechat' })
  assert.deepEqual(page.requests, [])
  assert.equal(page.warnings.length, 3)
  assert.ok(page.warnings.every(message => message.includes('审批权限')))
})

test('refund link does not navigate without order permission or a valid related order', () => {
  const forbidden = refundPage(false)
  forbidden.openRelatedOrder({ orderId: 71 })
  assert.deepEqual(forbidden.navigation, [])
  assert.match(forbidden.warnings[0], /权限/)
  for (const orderId of [undefined, null, '', 0, -1, 'invalid']) {
    const page = refundPage()
    page.openRelatedOrder({ id: 999, orderId })
    assert.deepEqual(page.navigation, [])
    assert.match(page.warnings[0], /关联订单/)
  }
})
