import assert from 'node:assert/strict'
import { test } from 'node:test'
import { firstProductPath, productAccessible, productTradable, routeProduct } from './products.js'

test('mall-only merchant never enters a dining workbench and respects staff permissions', () => {
  const products = [{ productType: 'DINING', historyAccessible: false, canTrade: false }, { productType: 'MALL', historyAccessible: true, canTrade: true }]
  assert.equal(firstProductPath(products, () => true), '/mall/orders')
  assert.equal(firstProductPath(products, value => value === 'finance:view'), '/mall/report')
  assert.equal(firstProductPath(products, () => false), '/services')
  assert.equal(firstProductPath([{ productType: 'DINING', historyAccessible: true, canTrade: false }, ...products.slice(1)], () => true), '/mall/orders')
})
test('expired or revoked products preserve historical access only when explicitly allowed by server', () => {
  const product = { granted: false, status: 'EXPIRED', historyAccessible: true, canTrade: false }
  assert.equal(productAccessible(product), true)
  assert.equal(productTradable(product), false)
  assert.equal(productAccessible({ granted: true, status: 'ACTIVE' }), false)
  assert.equal(productTradable({ historyAccessible: false, canTrade: true }), false)
  assert.equal(firstProductPath([], () => true), '/services')
})
test('public account routes are independent of product grants', () => {
  for (const path of ['/', '/login', '/403', '/services', '/settings', '/account/security']) assert.equal(routeProduct(path), null)
  assert.equal(routeProduct('/orders'), 'DINING')
  assert.equal(routeProduct('/mall/orders'), 'MALL')
})
