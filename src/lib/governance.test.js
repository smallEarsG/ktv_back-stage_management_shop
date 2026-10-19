import { test } from 'node:test'
import assert from 'node:assert/strict'
import { auditSummary } from './governance.js'
import * as governance from './governance.js'

test('merchant history explains changed permissions, resets and expiry in business language', () => {
  assert.match(auditSummary({ action: 'STAFF_PERMISSIONS', before: { permissions: [] }, after: { permissions: ['pos:view'] } }), /未分配.*收银/)
  assert.match(auditSummary({ action: 'ACCOUNT_RESET', after: { mustChange: true } }), /下次登录须改密/)
  assert.equal(auditSummary({ action: 'SERVICE_TERM', before: { expiresOn: null }, after: { expiresOn: '2027-10-14' } }), '无期限 → 2027-10-14')
  assert.match(auditSummary({ action: 'STAFF_STATUS', after: { active: false } }), /停用/)
})

test('product audit describes the actual changed switch while paused and ignores credential fields', () => {
  const before = { productType: 'MALL', granted: true, enabled: true, status: 'PAUSED' }
  const after = { ...before, enabled: false, privateKeyPem: 'never-render-this' }
  const summary = auditSummary({ action: 'PRODUCT_GRANT', before, after })
  assert.match(summary, /商城/)
  assert.match(summary, /新增交易开关：开启/)
  assert.match(summary, /新增交易开关：关闭/)
  assert.match(summary, /产品授权：已开通/)
  assert.doesNotMatch(summary, /never-render/)
})

test('application audit explains product and state without exposing application identifiers', () => {
  const summary = auditSummary({ action: 'APPLICATION_STATE', before: { productType: 'DINING', status: 'ACTIVE', applicationKey: 'hidden-key' }, after: { productType: 'DINING', status: 'PAUSED' } })
  assert.match(summary, /点餐/)
  assert.match(summary, /应用状态：启用/)
  assert.match(summary, /应用状态：暂停/)
  assert.doesNotMatch(summary, /hidden-key/)
  assert.equal(governance.auditActionLabels?.PRODUCT_GRANT, '调整产品授权')
  assert.equal(governance.auditActionLabels?.APPLICATION_STATE, '调整应用状态')
})
