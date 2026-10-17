import test from 'node:test'
import assert from 'node:assert/strict'
import { businessAllowed, scopePermissions, reportQuery } from '../src/lib/business.js'
import { visibleNavigation } from '../src/lib/navigation.js'
import { firstProductPath, routeProduct } from '../src/lib/products.js'

test('business scope preserves legacy staff and supports explicitly restricted employees', () => {
  assert.equal(businessAllowed('staff', ['order:view'], 'DINING'), true)
  assert.equal(businessAllowed('staff', ['business:scoped', 'business:MALL'], 'DINING'), false)
  assert.equal(businessAllowed('staff', ['business:scoped', 'business:MALL'], 'MALL'), true)
  assert.equal(businessAllowed('staff', ['business:scoped'], 'MALL'), false)
  assert.equal(businessAllowed('admin', [], 'MALL'), true)
  assert.deepEqual(scopePermissions(['order:view', 'business:DINING', 'business:scoped'], ['MALL']), ['order:view', 'business:scoped', 'business:MALL'])
})
test('mall dispatch employee sees only mall order operations, not finance or dining', () => {
  const menus = visibleNavigation(type => type === 'MALL', p => Array.isArray(p) ? p.includes('order:view') : p === 'order:view')
  assert.equal(menus.some(m => m.product === 'DINING'), false)
  const mall = menus.find(m => m.product === 'MALL')
  assert.deepEqual(mall.children.map(c => c.path), ['/mall/orders'])
  assert.equal(menus.some(m => m.path === '/reports'), false)
})
test('single-product and dual-product owners enter useful business overviews', () => {
  const dining = { productType: 'DINING', historyAccessible: true, canTrade: true }
  const mall = { productType: 'MALL', historyAccessible: true, canTrade: true }
  assert.equal(firstProductPath([mall], () => true), '/overview?business=MALL')
  assert.equal(firstProductPath([dining, mall], () => true), '/overview')
  assert.equal(firstProductPath([mall], () => false), '/services')
  assert.equal(routeProduct('/reports/ledger'), null)
  assert.deepEqual(reportQuery({ business: 'MALL', startsOn: '2026-10-01', endsOn: '2026-10-17', mode: 'REAL', channel: '', kind: 'REFUND' }), { business: 'MALL', startsOn: '2026-10-01', endsOn: '2026-10-17', mode: 'REAL', kind: 'REFUND' })
})
