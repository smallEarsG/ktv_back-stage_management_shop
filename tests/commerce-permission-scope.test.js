import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { test } from 'node:test'
import { computed, ref } from 'vue'
import dayjs from 'dayjs'
import { businessLabels, reportQuery } from '../src/lib/business.js'
import { hasAction } from '../src/lib/permissions.js'

function page(actions) {
  const pushes = []
  const permissions = ['permissions:v2', 'business:scoped', 'business:DINING', 'business:MALL', ...actions]
  const user = { canAccessProduct: type => ['DINING', 'MALL'].includes(type), hasPermission: (action, business) => hasAction('staff', permissions, business, action) }
  const route = { meta: { insightTab: 'overview' }, query: { business: 'ALL', startsOn: '2026-10-10', endsOn: '2026-10-10', mode: 'REAL' } }
  const sandbox = { computed, ref, dayjs, businessLabels, reportQuery, useRoute: () => route, useRouter: () => ({ push: value => pushes.push(value) }), useUserStore: () => user, onMounted() {}, onBeforeUnmount() {} }
  const script = fs.readFileSync(new URL('../src/views/commerce/CommerceReport.vue', import.meta.url), 'utf8').match(/<script setup>([\s\S]*?)<\/script>/)[1].replace(/^import .*$/gm, '').replaceAll('import.meta.env.VITE_DEMO_MODE', "'false'")
  vm.createContext(sandbox)
  vm.runInContext(script + '\napi = { data, financialBusinesses, memberBusinesses, inventoryBusinesses, canLedger, canDrillAllMetrics, financialScopeNote, openLedger, openOrder, businessHome };', sandbox)
  return { ...sandbox.api, pushes }
}

test('跨业务部分金额明确标注范围，业务入口不借用另一业务权限', () => {
  const report = page(['DINING:order:view', 'MALL:finance:view'])
  report.data.value = { businesses: ['DINING', 'MALL'], financialBusinesses: ['MALL'] }
  assert.equal(report.financialScopeNote.value.includes('金额仅包含有权查看的业务：商城经营'), true)
  assert.equal(report.canLedger.value, true)
  assert.equal(report.canDrillAllMetrics.value, true)
  assert.equal(report.businessHome('DINING'), '/orders')
  assert.equal(report.businessHome('MALL'), undefined)
  report.openLedger({ business: 'DINING' })
  assert.equal(report.pushes.length, 0)
  report.openLedger({ business: 'MALL' })
  assert.equal(report.pushes.length, 1)
  assert.equal(report.pushes[0].query.business, 'MALL')
  assert.equal(report.pushes[0].query.startsOn, '2026-10-10')
})

test('仅看板业务参与汇总但不能借另一业务财务权限下钻合计', () => {
  const report = page(['DINING:dashboard:view', 'MALL:finance:view'])
  report.data.value = { businesses: ['DINING', 'MALL'], financialBusinesses: ['DINING', 'MALL'] }
  assert.equal(report.canLedger.value, true)
  assert.equal(report.canDrillAllMetrics.value, false)
  report.openLedger({ business: 'DINING' })
  assert.equal(report.pushes.length, 0)
})

test('订单来源跳转同时遵守当前业务权限与服务端逐行授权', () => {
  const report = page(['DINING:order:view', 'MALL:finance:view'])
  report.openOrder({ business: 'MALL', orderId: 10, orderNo: 'M-10', canViewOrder: true })
  report.openOrder({ business: 'DINING', orderId: 11, orderNo: 'D-11', canViewOrder: false })
  assert.equal(report.pushes.length, 0)
  report.openOrder({ business: 'DINING', orderId: 11, orderNo: 'D-11', canViewOrder: true })
  assert.equal(report.pushes[0].path, '/orders')
  assert.equal(report.pushes[0].query.orderId, 11)
})

test('会员和仓库概览各自使用服务端授权业务范围', () => {
  const report = page(['DINING:operations:view', 'MALL:warehouse:view'])
  report.data.value = { businesses: ['DINING', 'MALL'], memberBusinesses: ['DINING'], inventoryBusinesses: ['MALL'] }
  assert.deepEqual([...report.memberBusinesses.value], ['DINING'])
  assert.deepEqual([...report.inventoryBusinesses.value], ['MALL'])
})
