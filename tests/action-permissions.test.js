import assert from 'node:assert/strict'
import test from 'node:test'
import { hasAction, normalizePermissions, toV2Permissions, templatePermissions, permissionLabel } from '../src/lib/permissions.js'
import { visibleNavigation } from '../src/lib/navigation.js'

test('a mixed-business employee reads dining orders but only ships mall orders', () => {
  const permissions = normalizePermissions(['DINING:order:view', 'MALL:order:ship'], ['DINING', 'MALL'])
  assert.equal(hasAction('staff', permissions, 'DINING', 'order:view'), true)
  assert.equal(hasAction('staff', permissions, 'DINING', 'order:edit'), false)
  assert.equal(hasAction('staff', permissions, 'MALL', 'order:ship'), true)
  assert.equal(hasAction('staff', permissions, 'MALL', 'order:pickup'), false)
  assert.equal(hasAction('staff', permissions, 'MALL', 'finance:view'), false)
  const nav = visibleNavigation(() => true, (action, business) => hasAction('staff', permissions, business, action))
  assert.deepEqual(nav.find(item => item.product === 'DINING').children.map(item => item.path), ['/orders'])
  assert.deepEqual(nav.find(item => item.product === 'MALL').children.map(item => item.path), ['/mall/orders'])
  assert.equal(nav.some(item => item.path === '/reports'), false)
})

test('action dependencies supply read access without adding unrelated write grants', () => {
  const permissions = normalizePermissions(['MALL:product:edit', 'DINING:warehouse:adjust'], ['DINING', 'MALL'])
  assert.equal(hasAction('staff', permissions, 'MALL', 'product:view'), true)
  assert.equal(hasAction('staff', permissions, 'MALL', 'product:create'), false)
  assert.equal(hasAction('staff', permissions, 'DINING', 'warehouse:view'), true)
  assert.equal(hasAction('staff', permissions, 'MALL', 'warehouse:adjust'), false)
  assert.throws(() => normalizePermissions(['MALL:sharing:bind'], ['MALL']), /同时选择/)
  assert.throws(() => normalizePermissions(['MALL:unknown:write'], ['MALL']), /权限选项/)
})

test('read-only grants cannot inherit legacy writes after the opt-in marker', () => {
  const permissions = normalizePermissions(['MALL:order:view'], ['MALL'])
  assert.equal(hasAction('staff', ['order:view'], 'MALL', 'order:ship'), true)
  assert.equal(hasAction('staff', [...permissions, 'order:view'], 'MALL', 'order:ship'), false)
  assert.equal(hasAction('staff', ['permissions:v2', 'MALL:order:ship'], 'MALL', 'order:ship'), false)
  assert.equal(hasAction('staff', permissions, 'DINING', 'order:view'), false)
})

test('role templates stay within selected products and separate financial execution', () => {
  const dispatch = templatePermissions('fulfillment', ['MALL'])
  assert.equal(hasAction('staff', dispatch, 'MALL', 'order:pickup'), true)
  assert.equal(hasAction('staff', dispatch, 'MALL', 'refund:approve'), false)
  assert.equal(hasAction('staff', dispatch, 'DINING', 'order:view'), false)
  const finance = templatePermissions('finance', ['DINING', 'MALL'])
  assert.equal(hasAction('staff', finance, 'MALL', 'finance:export'), true)
  assert.equal(hasAction('staff', finance, 'MALL', 'wallet:topup'), false)
  assert.equal(hasAction('staff', finance, 'DINING', 'warehouse:adjust'), false)
})

test('legacy conversion preserves granular capabilities and explicit scope restrictions', () => {
  const tokens = toV2Permissions(['order:view', 'product:view', 'warehouse:view'], ['DINING', 'MALL'])
  assert.equal(hasAction('staff', tokens, 'MALL', 'sharing:copy'), true)
  assert.equal(hasAction('staff', tokens, 'MALL', 'sharing:bind'), true)
  assert.equal(hasAction('staff', tokens, 'MALL', 'sharing:manage'), false)
  assert.equal(hasAction('staff', tokens, 'DINING', 'product:delete'), true)
  const mallOnly = toV2Permissions(['order:view', 'product:view'], ['MALL'])
  assert.equal(hasAction('staff', mallOnly, 'DINING', 'product:view'), false)
  assert.equal(hasAction('staff', mallOnly, 'MALL', 'sharing:copy'), false)
  assert.equal(permissionLabel('MALL:order:ship'), '商城 · 登记发货与物流')
})
